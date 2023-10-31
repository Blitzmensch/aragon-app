import {CheckboxListItem, Tag} from '@aragon/ods-old';
import React from 'react';
import {useTranslation} from 'react-i18next';
import {ControllerRenderProps} from 'react-hook-form/dist/types';
import {useCensus3SupportedChains} from '../../hooks/useCensus3';

/**
 * Type that infers the ControllerRenderProps value prop
 */
type ValueOfControllerRenderProps<T> = T extends ControllerRenderProps<any, any>
  ? T['value']
  : never;

/**
 * Checkbox used on the DAO creation process.
 *
 * It has a logic to show a `Comming Soon` label when the chainId is not compatible with vocdoni census3 service.
 * @constructor
 */
const GaslessSelector = ({
  onChange,
  value,
}: {
  onChange: (...event: any[]) => void;
  value: ValueOfControllerRenderProps<ControllerRenderProps>;
}) => {
  const {t} = useTranslation();

  const {isSupported} = useCensus3SupportedChains();

  return (
    <>
      {!isSupported && (
        <div className="flex flex-row-reverse gap-1">
          <Tag
            colorScheme="warning"
            label={t('createDAO.step3.votingType.gasless.soon')}
          />
        </div>
      )}
      <CheckboxListItem
        label={t('createDAO.step3.votingType.gasless.title')}
        helptext={t('createDAO.step3.votingType.gasless.subtitle')}
        onClick={() => {
          onChange('gasless');
        }}
        multiSelect={false}
        disabled={!isSupported}
        {...(value === 'gasless' ? {type: 'active'} : {})}
      />
    </>
  );
};

export default GaslessSelector;