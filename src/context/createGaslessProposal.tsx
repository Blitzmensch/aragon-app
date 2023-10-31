import {
  CreateMajorityVotingProposalParams,
  Erc20TokenDetails,
  Erc20WrapperTokenDetails,
} from '@aragon/sdk-client';
import {ProposalMetadata} from '@aragon/sdk-client-common';
import {useCallback, useState} from 'react';

import {
  AccountData,
  Census,
  Census3Census,
  Election,
  ErrAccountNotFound,
  ICensus3Token,
  IElectionParameters,
  TokenCensus,
  UnpublishedElection,
} from '@vocdoni/sdk';
import {VoteValues} from '@aragon/sdk-client';
import {useClient} from '@vocdoni/react-providers';
import {
  StepsMap,
  StepStatus,
  useFunctionStepper,
} from '../hooks/useFunctionStepper';

// todo(kon): move this block somewhere else
export enum GaslessProposalStepId {
  REGISTER_VOCDONI_ACCOUNT = 'REGISTER_VOCDONI_ACCOUNT',
  CREATE_VOCDONI_ELECTION = 'CREATE_VOCDONI_ELECTION',
  CREATE_ONCHAIN_PROPOSAL = 'CREATE_ONCHAIN_PROPOSAL',
  PROPOSAL_IS_READY = 'PROPOSAL_IS_READY',
}

export type GaslessProposalSteps = StepsMap<GaslessProposalStepId>;

type ICreateGaslessProposal = {
  daoToken: Erc20TokenDetails | Erc20WrapperTokenDetails | undefined;
};

export type UseCreateElectionProps = Omit<
  IElectionParameters,
  | 'header'
  | 'streamUri'
  | 'voteType'
  | 'electionType'
  | 'questions'
  | 'maxCensusSize'
  | 'addSDKVersion'
> & {
  question: string;
};

interface IProposalToElectionProps {
  metadata: ProposalMetadata;
  data: CreateMajorityVotingProposalParams;
  census: Census;
}

const proposalToElection = ({
  metadata,
  data,
  census,
}: IProposalToElectionProps): UseCreateElectionProps => {
  return {
    title: metadata.title,
    description: metadata.description,
    question: metadata.summary,
    startDate: data?.startDate ?? undefined,
    endDate: data?.endDate ?? new Date(),
    meta: data, // Store all DAO metadata to retrieve it easily
    census: census,
  };
};

// todo(kon): end to move this block somewhere else

const useCreateGaslessProposal = ({daoToken}: ICreateGaslessProposal) => {
  const [electionId, setElectionId] = useState('');

  const {steps, updateStepStatus, doStep, globalState, resetStates} =
    useFunctionStepper({
      initialSteps: {
        REGISTER_VOCDONI_ACCOUNT: {
          status: StepStatus.WAITING,
        },
        CREATE_VOCDONI_ELECTION: {
          status: StepStatus.WAITING,
        },
        CREATE_ONCHAIN_PROPOSAL: {
          status: StepStatus.WAITING,
        },
        PROPOSAL_IS_READY: {
          status: StepStatus.WAITING,
        },
      } as GaslessProposalSteps,
    });

  const {client: vocdoniClient, census3} = useClient();

  // todo(kon): move this somewhere?
  const collectFaucet = useCallback(
    async (cost: number, account: AccountData) => {
      let balance = account.balance;
      while (cost > balance) {
        balance = (await vocdoniClient.collectFaucetTokens()).balance;
      }
    },
    [vocdoniClient]
  );

  const createVocdoniElection = useCallback(
    async (electionData: UseCreateElectionProps) => {
      const election: UnpublishedElection = Election.from({
        title: electionData.title,
        description: electionData.description,
        endDate: electionData.endDate,
        startDate: electionData.startDate,
        census: electionData.census,
        maxCensusSize: electionData.census.size ?? undefined,
      });
      election.addQuestion(
        electionData.question,
        '',
        // Map choices from Aragon enum.
        // This is important to respect the order and the values
        Object.keys(VoteValues)
          .filter(key => isNaN(Number(key)))
          .map((key, i) => ({
            title: key,
            value: i,
          }))
      );
      // todo(kon): handle how collect faucet have to work
      const cost = await vocdoniClient.calculateElectionCost(election);
      const accountInfo = await vocdoniClient.fetchAccountInfo();

      console.log(
        'DEBUG',
        'Estimated cost',
        cost,
        'balance',
        accountInfo.balance
      );

      await collectFaucet(cost, accountInfo);

      console.log('DEBUG', 'Creating election:', election);
      return await vocdoniClient.createElection(election);
    },
    [collectFaucet, vocdoniClient]
  );

  const createAccount = useCallback(async () => {
    // Check if the account is already created, if not, create it
    let account: AccountData | null = null;
    try {
      console.log('DEBUG', 'get  account info');
      account = await vocdoniClient.fetchAccountInfo();
    } catch (e) {
      // todo(kon): replace error handling when the api return code error is fixed. Now is a generic 500
      if (e instanceof ErrAccountNotFound) {
        console.log('DEBUG', 'Account not found, creating it');
        account = await vocdoniClient.createAccount();
      } else throw e;
    }

    if (!account) {
      throw Error('Error creating a Vocdoni account');
    }

    return account;
  }, [vocdoniClient]);

  const createCensus = useCallback(async (): Promise<TokenCensus> => {
    async function getCensus3Token(): Promise<ICensus3Token> {
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const censusToken = await census3.getToken(daoToken!.address);
        if (censusToken.status.synced) {
          return censusToken; // early exit if the object has sync set to true
        }
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
      }
      throw Error('Census token is not already calculated, try again later');
    }

    const censusToken = await getCensus3Token();
    console.log('DEBUG', 'Census', censusToken);

    // Create the vocdoni census
    console.log('DEBUG', 'Creating vocdoni census');
    const census3census: Census3Census = await census3.createCensus(
      censusToken.defaultStrategy
    );

    return new TokenCensus(
      census3census.merkleRoot,
      census3census.uri,
      census3census.anonymous,
      censusToken,
      census3census.size,
      BigInt(census3census.weight)
    );
    // return await census3.createTokenCensus(censusToken.id);
  }, [census3, daoToken]);

  const createProposal = useCallback(
    async (
      metadata: ProposalMetadata,
      data: CreateMajorityVotingProposalParams,
      handleOnchainProposal: (electionId?: string) => Promise<Error | undefined>
    ) => {
      console.log(
        'DEBUG',
        'Start creating a proposal. Global state:',
        globalState,
        steps
      );

      if (globalState === StepStatus.ERROR) {
        // If global status is error, reset the stepper states
        resetStates();
      } else if (globalState === StepStatus.SUCCESS) {
        return await handleOnchainProposal();
      }

      if (!daoToken) {
        return new Error('ERC20 SDK client is not initialized correctly');
      }

      // 1. Create an account if not exists
      await doStep(
        GaslessProposalStepId.REGISTER_VOCDONI_ACCOUNT,
        createAccount
      );
      console.log('DEBUG', 'Account created start creating gasless proposal');

      // 2. Create vocdoni election
      const electionId = await doStep(
        GaslessProposalStepId.CREATE_VOCDONI_ELECTION,
        async () => {
          // 2.1 Register gasless proposal
          // This involves various steps such the census creation and election creation
          console.log('DEBUG', 'Creating vocdoni census');
          const census = await createCensus();
          // 2.2. Create vocdoni election
          console.log('DEBUG', 'Creating vocdoni election');
          return await createVocdoniElection(
            proposalToElection({metadata, data, census})
          );
        }
      );
      setElectionId(electionId);
      console.log('DEBUG', 'Election created', electionId);

      // 3. Register the proposal onchain
      // todo(kon): Register election to the DAO
      await doStep(
        GaslessProposalStepId.CREATE_ONCHAIN_PROPOSAL,
        async () => await handleOnchainProposal(electionId)
      );
      console.log('DEBUG', 'Proposal gasless created', electionId);

      // 4. All ready
      updateStepStatus(
        GaslessProposalStepId.PROPOSAL_IS_READY,
        StepStatus.SUCCESS
      );
      console.log('DEBUG', 'All done!', globalState, electionId);
    },
    [
      globalState,
      steps,
      daoToken,
      doStep,
      createAccount,
      updateStepStatus,
      resetStates,
      createCensus,
      createVocdoniElection,
    ]
  );

  return {steps, globalState, createProposal, electionId};
};

export {useCreateGaslessProposal};
