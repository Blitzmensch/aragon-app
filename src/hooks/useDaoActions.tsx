import {useTranslation} from 'react-i18next';

import {ActionParameter, HookData} from 'utils/types';
import {useDaoQuery} from './useDaoDetails';
import {getDaoTokenOwner} from 'utils/tokens';
import {useDaoToken} from './useDaoToken';
import {useProviders} from 'context/providers';
import {useEffect, useState} from 'react';
import {featureFlags} from 'utils/featureFlags';
import {PluginTypes} from './usePluginClient';
import {
  isGaslessVotingSettings,
  useVotingSettings,
} from '../services/aragon-sdk/queries/use-voting-settings';

export function useDaoActions(dao: string): HookData<ActionParameter[]> {
  const {
    data: daoDetails,
    error,
    isLoading: daoDetailsLoading,
  } = useDaoQuery(dao);
  const {id: pluginType} = daoDetails?.plugins[0] || {};
  const multisig = pluginType === 'multisig.plugin.dao.eth';

  const {data: votingSettings, isLoading: settingsLoading} = useVotingSettings({
    pluginAddress: daoDetails?.plugins[0].instanceAddress as string,
    pluginType: daoDetails?.plugins[0].id as PluginTypes,
  });

  const isLoading = daoDetailsLoading || settingsLoading;

  const [showMintOption, setShowMintOption] = useState(false);

  const {api: provider} = useProviders();

  const {data: daoToken} = useDaoToken(
    daoDetails?.plugins[0].instanceAddress || ''
  );

  useEffect(() => {
    async function fetch() {
      const daoTokenView = await getDaoTokenOwner(
        daoToken?.address || '',
        provider
      );
      setShowMintOption(
        daoTokenView?.toLocaleLowerCase() === daoDetails?.address
      );
    }
    if (isLoading) return;
    if (votingSettings && isGaslessVotingSettings(votingSettings)) {
      setShowMintOption(votingSettings.hasGovernanceEnabled!);
      return;
    }
    void fetch();
  }, [
    dao,
    daoDetails,
    daoDetails?.address,
    daoToken?.address,
    isLoading,
    provider,
    showMintOption,
    votingSettings,
  ]);

  const {t} = useTranslation();

  const baseActions: ActionParameter[] = [
    {
      type: 'withdraw_assets',
      title: t('TransferModal.item2Title'),
      subtitle: t('AddActionModal.withdrawAssetsSubtitle'),
      isReuseable: true,
    },
    {
      type: 'wallet_connect_modal',
      title: t('AddActionModal.connectdAppsTitle'),
      subtitle: t('AddActionModal.connectdAppsSubtitle'),
      isReuseable: true,
      isDisabled:
        featureFlags.getValue('VITE_FEATURE_FLAG_DAO_WALLET_CONNECT') ===
        'false',
    },
    {
      type: 'external_contract_modal',
      title: t('AddActionModal.externalContract'),
      subtitle: t('AddActionModal.externalContractSubtitle'),
      isReuseable: true,
    },
  ];

  const multisigActions = [
    {
      type: 'add_address',
      title: t('AddActionModal.addAddresses'),
      subtitle: t('AddActionModal.addAddressesSubtitle'),
    },
    {
      type: 'remove_address',
      title: t('AddActionModal.removeAddresses'),
      subtitle: t('AddActionModal.removeAddressesSubtitle'),
    },
  ].concat(baseActions) as ActionParameter[];

  const tokenVotingActions = showMintOption
    ? ([
        {
          type: 'mint_tokens',
          title: t('AddActionModal.mintTokens'),
          subtitle: t('AddActionModal.mintTokensSubtitle'),
        },
      ].concat(baseActions) as ActionParameter[])
    : baseActions;

  const actions = (multisig ? multisigActions : tokenVotingActions).filter(
    ({isDisabled}) => isDisabled !== true
  );

  return {
    data: actions,
    isLoading,
    error: error as Error,
  };
}
