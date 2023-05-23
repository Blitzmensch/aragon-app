import {
  AlertInline,
  ButtonText,
  IconSuccess,
  NumberInput,
  TextInput,
  WalletInput,
} from '@aragon/ui-components';
import {useActionsContext} from 'context/actions';
import {useAlertContext} from 'context/alert';
import {useNetwork} from 'context/network';
import {ethers} from 'ethers';
import {t} from 'i18next';
import React, {useCallback, useEffect, useState} from 'react';
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {useParams} from 'react-router-dom';
import {trackEvent} from 'services/analytics';
import {getEtherscanVerifiedContract} from 'services/etherscanAPI';
import styled from 'styled-components';
import {
  getUserFriendlyWalletLabel,
  handleClipboardActions,
} from 'utils/library';
import {SmartContractAction, Input, SmartContract} from 'utils/types';
import {validateAddress} from 'utils/validators';

type InputFormProps = {
  actionIndex: number;
  onComposeButtonClicked: () => void;
};

const InputForm: React.FC<InputFormProps> = ({
  actionIndex,
  onComposeButtonClicked,
}) => {
  const {t} = useTranslation();
  const {network} = useNetwork();
  const [selectedAction, selectedSC, sccActions]: [
    SmartContractAction,
    SmartContract,
    Record<string, Record<string, Record<string, unknown>>>
  ] = useWatch({
    name: ['selectedAction', 'selectedSC', 'sccActions'],
  });
  const {dao: daoAddressOrEns} = useParams();
  const {addAction, removeAction} = useActionsContext();
  const {setValue, resetField} = useFormContext();
  const [formError, setFormError] = useState(false);

  const composeAction = useCallback(async () => {
    const etherscanData = await getEtherscanVerifiedContract(
      selectedSC.address,
      network
    );

    if (
      etherscanData.status === '1' &&
      etherscanData.result[0].ABI !== 'Contract source code not verified'
    ) {
      const functionParams = selectedAction.inputs?.map(
        input => sccActions[selectedSC.address][selectedAction.name][input.name]
      );

      const iface = new ethers.utils.Interface(etherscanData.result[0].ABI);

      try {
        iface.encodeFunctionData(selectedAction.name, functionParams);

        removeAction(actionIndex);
        addAction({
          name: 'external_contract_action',
        });

        resetField(`actions.${actionIndex}`);
        setValue(`actions.${actionIndex}.name`, 'external_contract_action');
        setValue(`actions.${actionIndex}.contractAddress`, selectedSC.address);
        setValue(`actions.${actionIndex}.contractName`, selectedSC.name);
        setValue(`actions.${actionIndex}.functionName`, selectedAction.name);

        selectedAction.inputs?.map((input, index) => {
          // TODO: Recursively do this process
          if (input.type === 'tuple') {
            const data = {...selectedAction.inputs[index]};
            if (data.components) {
              data.components.map(
                (component, index) =>
                  (data.components![index].value = (
                    sccActions[selectedSC.address][selectedAction.name][
                      input.name
                    ] as Record<string, unknown>
                  )[component.name])
              );
            }
            setValue(`actions.${actionIndex}.inputs.${index}`, data);
          } else {
            setValue(`actions.${actionIndex}.inputs.${index}`, {
              ...selectedAction.inputs[index],
              value:
                sccActions[selectedSC.address][selectedAction.name][input.name],
            });
          }
        });
        resetField('sccActions');
        onComposeButtonClicked();

        trackEvent('newProposal_composeAction_clicked', {
          dao_address: daoAddressOrEns,
          smart_contract_address: selectedSC.address,
          smart_contract_name: selectedSC.name,
          method_name: selectedAction.name,
        });
      } catch (e) {
        // Invalid input data being passed to the action
        setFormError(true);
        console.error('Error invalidating action inputs', e);
      }
    }
  }, [
    actionIndex,
    addAction,
    daoAddressOrEns,
    network,
    onComposeButtonClicked,
    removeAction,
    resetField,
    sccActions,
    selectedAction.inputs,
    selectedAction.name,
    selectedSC.address,
    selectedSC.name,
    setValue,
  ]);

  if (!selectedAction) {
    return (
      <div className="desktop:p-6 min-h-full desktop:bg-white bg-ui-50">
        Sorry, no public Write functions were found for this contract.
      </div>
    );
  }

  return (
    <div className="desktop:p-6 min-h-full desktop:bg-white bg-ui-50">
      <div className="desktop:flex items-baseline space-x-3">
        <ActionName>{selectedAction.name}</ActionName>
        <div className="hidden desktop:flex items-center space-x-1 text-primary-600">
          <p className="text-sm font-bold text-primary-500">
            {selectedSC.name}
          </p>
          <IconSuccess />
        </div>
      </div>
      <ActionDescription>{selectedAction.notice}</ActionDescription>
      <div className="flex desktop:hidden items-center mt-1 space-x-1 text-primary-600">
        <p className="text-sm font-bold text-primary-500">{selectedSC.name}</p>
        <IconSuccess />
      </div>
      {selectedAction.inputs.length > 0 ? (
        <div className="p-3 mt-5 space-y-2 bg-white rounded-xl border desktop:bg-ui-50 border-ui-100 shadow-100">
          {selectedAction.inputs.map(input => (
            <div key={input.name}>
              <div className="text-base font-bold capitalize text-ui-800">
                {input.name}
                <span className="ml-0.5 text-sm normal-case">
                  ({input.type})
                </span>
              </div>
              <div className="mt-0.5 mb-1.5">
                <span className="text-ui-600 ft-text-sm">{input.notice}</span>
              </div>
              <ComponentForType
                key={input.name}
                context="SCCModal"
                input={input}
                functionName={`${selectedSC.address}.${selectedAction.name}`}
              />
            </div>
          ))}
        </div>
      ) : null}

      <ButtonText
        label={t('scc.detailContract.ctaLabel')}
        className="mt-5 mb-2 w-full desktop:w-max"
        onClick={composeAction}
      />

      {formError && (
        <AlertInline label="Error with the inputs" mode="critical" />
      )}
    </div>
  );
};

type ComponentForTypeProps = {
  context: 'SCCModal' | 'SCCAction' | 'ExecutionWidget';
  input: Input;
  functionName?: string;
  formHandleName?: string;
  defaultValue?: unknown;
  disabled?: boolean;
};

const classifyInputType = (inputName: string) => {
  if (inputName.includes('int') && inputName.includes('[]') === false) {
    return 'int';
  } else return inputName;
};

export const ComponentForType: React.FC<ComponentForTypeProps> = ({
  context,
  input,
  functionName,
  formHandleName,
  defaultValue,
  disabled = false,
}) => {
  const {alert} = useAlertContext();
  const {setValue} = useFormContext();

  const formName = formHandleName
    ? context !== 'SCCModal'
      ? `${formHandleName}.value`
      : formHandleName
    : `sccActions.${functionName}.${input.name}`;

  useEffect(() => {
    if (defaultValue) {
      setValue(formName, defaultValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if we need to add "index" kind of variable to the "name"
  switch (classifyInputType(input.type)) {
    case 'address':
      return (
        <Controller
          defaultValue=""
          name={formName}
          rules={{
            required: t('errors.required.walletAddress') as string,
            validate: value => validateAddress(value),
          }}
          render={({
            field: {name, value, onBlur, onChange},
            fieldState: {error},
          }) => (
            <WalletInput
              mode={error ? 'critical' : 'default'}
              name={name}
              value={getUserFriendlyWalletLabel(value, t)}
              onBlur={onBlur}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                onChange(e.target.value);
              }}
              placeholder="0x"
              adornmentText={value ? t('labels.copy') : t('labels.paste')}
              disabledFilled={disabled}
              onAdornmentClick={() =>
                handleClipboardActions(value, onChange, alert)
              }
            />
          )}
        />
      );

    case 'int':
      return (
        <Controller
          defaultValue=""
          name={formName}
          render={({
            field: {name, value, onBlur, onChange},
            fieldState: {error},
          }) => (
            <NumberInput
              name={name}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="0"
              includeDecimal
              disabled={disabled}
              mode={error?.message ? 'critical' : 'default'}
              value={value}
            />
          )}
        />
      );

    case 'tuple':
      // eslint-disable-next-line no-case-declarations
      const components =
        input.components ||
        Object.entries(input.value)
          .filter(([key]) => Number.isNaN(Number(key)))
          .map(([k, v]) => ({name: k, value: v}));

      console.log(components);

      return components ? (
        <div className="px-2 space-y-2">
          {components.map((component, index) => (
            <div key={component.name}>
              <div className="mb-1.5 text-base font-bold capitalize text-ui-800">
                {component.name}
              </div>
              <ComponentForType
                key={component.name}
                context={context}
                input={component}
                functionName={`${functionName}.${input.name}`}
                formHandleName={
                  context !== 'SCCModal'
                    ? `${formHandleName}.components.${index}`
                    : undefined
                }
                defaultValue={context === 'ExecutionWidget' && component.value}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      ) : null;

    default:
      return (
        <Controller
          defaultValue=""
          name={formName}
          render={({
            field: {name, value, onBlur, onChange},
            fieldState: {error},
          }) => (
            <TextInput
              name={name}
              onBlur={onBlur}
              onChange={onChange}
              placeholder={`${input.name} (${input.type})`}
              mode={error?.message ? 'critical' : 'default'}
              value={value}
              disabled={disabled}
            />
          )}
        />
      );
  }
};

export const ComponentForTypeWithFormProvider: React.FC<
  ComponentForTypeProps
> = ({input, functionName, formHandleName, defaultValue, disabled = false}) => {
  const methods = useForm({mode: 'onChange'});
  return (
    <FormProvider {...methods}>
      <ComponentForType
        key={input.name}
        context="ExecutionWidget"
        input={input}
        functionName={functionName}
        disabled={disabled}
        defaultValue={defaultValue}
        formHandleName={formHandleName}
      />
    </FormProvider>
  );
};

const ActionName = styled.p.attrs({
  className: 'text-lg font-bold text-ui-800 capitalize',
})``;

const ActionDescription = styled.p.attrs({
  className: 'mt-1 text-sm text-ui-600',
})``;

export default InputForm;
