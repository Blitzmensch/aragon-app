import {
  useClient,
  useClient as useVocdoniClient,
} from '@vocdoni/react-providers';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {VoteProposalParams} from '@aragon/sdk-client';
import {Vote} from '@vocdoni/sdk';
import {
  StepsMap,
  StepStatus,
  useFunctionStepper,
} from '../hooks/useFunctionStepper';
import {
  GaslessVotingProposal,
  GaslessVotingClient,
} from '@vocdoni/gasless-voting';
import {DetailedProposal} from '../utils/types';
import {isGaslessProposal} from '../utils/proposals';
import {GaselessPluginName, usePluginClient} from '../hooks/usePluginClient';
import {useWallet} from '../hooks/useWallet';
import {useDaoDetailsQuery} from '../hooks/useDaoDetails';
import {ProposalStatus} from '@aragon/sdk-client-common';

export enum GaslessVotingStepId {
  CREATE_VOTE_ID = 'CREATE_VOTE_ID',
  PUBLISH_VOTE = 'PUBLISH_VOTE',
}

export type GaslessVotingSteps = StepsMap<GaslessVotingStepId>;

const useGaslessVoting = () => {
  const {client: vocdoniClient} = useVocdoniClient();
  const pluginClient = usePluginClient(
    GaselessPluginName
  ) as GaslessVotingClient;
  const {data: daoDetails} = useDaoDetailsQuery();

  const getElectionId = useCallback(
    async (proposalId: string) => {
      if (daoDetails === undefined) return '';

      const proposal = await pluginClient.methods.getProposal(
        proposalId,
        daoDetails!.ensDomain,
        daoDetails!.address
      );

      return proposal?.vochainProposalId || '';
    },
    [daoDetails, pluginClient]
  );

  const {steps, doStep, globalState, resetStates} = useFunctionStepper({
    initialSteps: {
      CREATE_VOTE_ID: {
        status: StepStatus.WAITING,
      },
      PUBLISH_VOTE: {
        status: StepStatus.WAITING,
      },
    } as GaslessVotingSteps,
  });

  const submitVote = useCallback(
    async (vote: VoteProposalParams, electionId: string) => {
      const vocVote = new Vote([vote.vote - 1]); // See values on the enum, using vocdoni starts on 0
      console.log('DEBUG', 'ElectionId and vote', electionId, vocVote);
      await vocdoniClient.setElectionId(electionId);
      console.log('DEBUG', 'Submitting the vote');
      const voteId = await vocdoniClient.submitVote(vocVote);
      console.log('DEBUG', 'Vote submitted');
      return voteId;
    },
    [vocdoniClient]
  );

  const vote = useCallback(
    async (vote: VoteProposalParams) => {
      console.log('DEBUG', 'Trying to get election id for', vote.proposalId);

      if (globalState === StepStatus.ERROR) {
        // If global status is error, reset the stepper states
        resetStates();
      }

      // 1. Retrieve the election id
      const electionId = await doStep(
        GaslessVotingStepId.CREATE_VOTE_ID,
        async () => {
          const electionId = getElectionId(vote.proposalId);
          if (!electionId) {
            throw Error(
              'Proposal id has not any associated vocdoni electionId'
            );
          }
          return electionId;
        }
      );
      console.log('DEBUG', 'ElectionId found', electionId);

      // 2. Sumbit vote
      await doStep(GaslessVotingStepId.PUBLISH_VOTE, async () => {
        await submitVote(vote, electionId!);
      });
    },
    [doStep, getElectionId, submitVote]
  );

  return {vote, getElectionId, steps, globalState};
};

/**
 * Wrapper for client.hasAlreadyVoted().
 *
 * Used to call asynchronously the has already vote function and store it on a react state.
 */
export const useGaslessHasAlreadyVote = ({
  proposal,
}: {
  proposal: DetailedProposal | undefined | null;
}) => {
  const [hasAlreadyVote, setHasAlreadyVote] = useState(false);
  const {client} = useClient();

  useEffect(() => {
    const checkAlreadyVote = async () => {
      // todo(kon): implement voters.some and if not, do the set has already vote
      // if (proposal.votes.some(vote => vote.voter === address)) {
      //   setHasAlreadyVote(true);
      //   return;
      // }
      setHasAlreadyVote(
        !!(await client.hasAlreadyVoted(
          (proposal as GaslessVotingProposal)!.vochainProposalId!
        ))
      );
    };
    if (
      client &&
      proposal &&
      isGaslessProposal(proposal) &&
      proposal?.vochainProposalId
    ) {
      checkAlreadyVote();
    }
  }, [client, proposal]);

  return {hasAlreadyVote};
};

export const useGaslessCommiteVotes = (
  pluginAddress: string,
  proposal: GaslessVotingProposal
) => {
  const [canApprove, setCanApprove] = useState(false);
  const client = usePluginClient(GaselessPluginName) as GaslessVotingClient;
  const {address} = useWallet();

  const isApprovalPeriod = (proposal => {
    if (!proposal) return false;
    return (
      proposal.endDate.valueOf() < new Date().valueOf() &&
      proposal.expirationDate.valueOf() > new Date().valueOf()
    );
  })(proposal);

  const proposalCanBeApproved =
    isApprovalPeriod && proposal.status === ProposalStatus.SUCCEEDED;

  const approved = useMemo(() => {
    return proposal.approvers?.some(approver => approver === address);
  }, [address, proposal.approvers]);

  const isApproved = (proposal => {
    if (!proposal) return false;
    return proposal.settings.minTallyApprovals <= proposal.approvers.length;
  })(proposal);

  const canBeExecuted = (proposal => {
    if (!client || !proposal) return false;
    return isApproved && proposalCanBeApproved;
  })(proposal);

  const nextVoteWillApprove =
    proposal.approvers.length + 1 === proposal.settings.minTallyApprovals;

  const executed = proposal.executed;

  const notBegan = proposal.endDate.valueOf() > new Date().valueOf();

  useEffect(() => {
    const checkCanVote = async () => {
      const canApprove =
        (await client?.methods.isMultisigMember(pluginAddress, address!)) ||
        false;
      setCanApprove(canApprove);
    };

    if (!(address && client)) {
      return;
    }

    if (approved || !isApprovalPeriod || !proposalCanBeApproved) {
      setCanApprove(false);
      return;
    }
    checkCanVote();
  }, [
    address,
    client,
    isApprovalPeriod,
    pluginAddress,
    proposalCanBeApproved,
    approved,
  ]);

  return {
    isApprovalPeriod,
    canApprove,
    approved,
    isApproved,
    canBeExecuted,
    nextVoteWillApprove,
    proposalCanBeApproved,
    executed,
    notBegan,
  };
};

export default useGaslessVoting;