import { useState } from 'react';
import { PAYOUT_METHODS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { PayoutAccount, PayoutMethod } from '../../../types';
import { isValidPhone, toE164 } from '../../../utils/validators';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Callout } from '../../common/Callout';
import { Input } from '../../common/Input';
import { PhoneInput } from '../../common/PhoneInput';
import { MethodDot } from './MethodDot';
import { payoutColor, payoutLabelKey } from './labels';

interface PayoutSheetProps {
  onClose: () => void;
  /** The store stamps `id` and `providerId`. */
  onSave: (account: Omit<PayoutAccount, 'id' | 'providerId'>) => void;
}

/** Adding somewhere for the money to land. A wallet is a phone number; a bank
    account needs the bank and whose name is on it, because that is what a
    Bangladeshi transfer is checked against. */
export function PayoutSheet({ onClose, onSave }: PayoutSheetProps) {
  const t = useT();
  const [method, setMethod] = useState<PayoutMethod>('bkash');
  const [holder, setHolder] = useState('');
  const [wallet, setWallet] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isBank = method === 'bank';
  const errors = {
    holder: holder.trim() ? undefined : t('pb.errHolder'),
    wallet: isBank || isValidPhone(wallet) ? undefined : t('pb.errWallet'),
    number: !isBank || accountNumber.trim() ? undefined : t('pb.errNumber'),
    bankName: !isBank || bankName.trim() ? undefined : t('pb.errBankName'),
  };
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (errors.holder || errors.wallet || errors.number || errors.bankName) return;
    onSave({
      method,
      number: isBank ? accountNumber.trim() : toE164(wallet),
      holderName: holder.trim(),
      bankName: isBank ? bankName.trim() : undefined,
      // A freshly added account takes over the payouts, but nothing moves
      // until a person has checked it.
      isDefault: true,
      verified: false,
    });
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('pb.payoutAdd')}
      footer={<Button block onClick={submit}>{t('action.save')}</Button>}
    >
      <div className="stack">
        <fieldset className="pb-fieldset">
          <legend className="field-label">{t('pb.payoutMethod')}</legend>
          <div className="stack-sm" role="radiogroup" aria-label={t('pb.payoutMethod')}>
            {PAYOUT_METHODS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="option"
                role="radio"
                aria-checked={method === option.id}
                onClick={() => setMethod(option.id)}
              >
                <MethodDot color={payoutColor(option.id)} size={12} />
                <span className="option-body">
                  <span className="option-title">{t(payoutLabelKey(option.id))}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <Input
          label={t('pb.payoutHolder')}
          placeholder={t('pb.payoutHolderPlaceholder')}
          value={holder}
          error={show('holder')}
          onChange={(event) => setHolder(event.target.value)}
        />

        {isBank ? (
          <>
            <Input
              label={t('pb.payoutNumber')}
              placeholder={t('pb.payoutNumberPlaceholder')}
              inputMode="numeric"
              value={accountNumber}
              error={show('number')}
              onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, ''))}
            />
            <Input
              label={t('pb.payoutBankName')}
              placeholder={t('pb.payoutBankPlaceholder')}
              value={bankName}
              error={show('bankName')}
              onChange={(event) => setBankName(event.target.value)}
            />
          </>
        ) : (
          <PhoneInput
            label={t('pb.payoutWallet')}
            value={wallet}
            error={show('wallet')}
            onChange={setWallet}
          />
        )}

        <Callout tone="info">{t('pb.payoutNewHint')}</Callout>
      </div>
    </BottomSheet>
  );
}
