import {
  ButtonText,
  NumberInput,
  TextInput,
  WalletInput,
} from '@aragon/ui-components';
import {useActionsContext} from 'context/actions';
import {useAlertContext} from 'context/alert';
import {t} from 'i18next';
import React from 'react';
import {Controller, useFormContext, useWatch} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {
  getUserFriendlyWalletLabel,
  handleClipboardActions,
} from 'utils/library';
import {SmartContractAction, Input} from 'utils/types';
import {validateAddress} from 'utils/validators';

type InputFormProps = {
  actionIndex: number;
  onComposeButtonClicked: () => void;
};

const InputForm: React.FC<InputFormProps> = ({onComposeButtonClicked}) => {
  const [selectedAction]: [SmartContractAction] = useWatch({
    name: ['selectedAction'],
  });
  const {t} = useTranslation();
  const {addAction} = useActionsContext();

  return (
    <div className="p-6 min-h-full bg-white">
      <p className="text-lg font-bold capitalize text-ui-800">
        {selectedAction.name}
      </p>
      <p className="mt-1 text-sm text-ui-600">
        @notice as help text; This is the description of the method provided by
        NatSpec Format or if those are our smart contracts, by further
        implementation
      </p>
      {selectedAction.inputs.length > 0 ? (
        <div className="p-3 mt-5 space-y-2 rounded-xl bg-ui-50 border-ui-100 shadow-100">
          {selectedAction.inputs.map(input => (
            <div key={input.name}>
              <div className="mb-1.5 text-base font-bold capitalize text-ui-800">
                {input.name}
                <span className="ml-0.5 text-sm normal-case">
                  ({input.type})
                </span>
              </div>
              <ComponentForType
                key={input.name}
                input={input}
                functionName={selectedAction.name}
              />
            </div>
          ))}
        </div>
      ) : null}

      <ButtonText
        label={t('scc.labels.compose')}
        className="mt-5"
        onClick={() => {
          addAction({
            name: 'external_contract_action',
          });
          onComposeButtonClicked();
        }}
      />
    </div>
  );
};

type ComponentForTypeProps = {
  input: Input;
  functionName: string;
};

const ComponentForType: React.FC<ComponentForTypeProps> = ({
  input,
  functionName,
}) => {
  const {control} = useFormContext();
  const {alert} = useAlertContext();

  // Check if we need to add "index" kind of variable to the "name"
  switch (input.type) {
    case 'address':
      return (
        <Controller
          defaultValue=""
          name={`actions.${functionName}.${input.name}`}
          control={control}
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
              onAdornmentClick={() =>
                handleClipboardActions(value, onChange, alert)
              }
            />
          )}
        />
      );

    case 'uint':
    case 'int':
    case 'uint8':
    case 'int8':
    case 'uint32':
    case 'int32':
    case 'uint256':
    case 'int256':
      return (
        <Controller
          defaultValue=""
          name={`actions.${functionName}.${input.name}`}
          control={control}
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
              mode={error?.message ? 'critical' : 'default'}
              value={value}
            />
          )}
        />
      );

    case 'tuple':
      input.components?.map(component => (
        <div key={component.name}>
          <div className="mb-1.5 text-base font-bold capitalize text-ui-800">
            {input.name}
          </div>
          <ComponentForType
            key={component.name}
            input={component}
            functionName={input.name}
          />
        </div>
      ));
      break;

    default:
      return (
        <Controller
          defaultValue=""
          name={`actions.${functionName}.${input.name}`}
          control={control}
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
            />
          )}
        />
      );
  }
  return null;
};

export default InputForm;
