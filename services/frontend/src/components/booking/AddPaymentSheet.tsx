import { useState } from 'react';
import type { PaymentMethod } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { isValidPhone } from '../../utils/validators';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { PhoneInput } from '../common/PhoneInput';
import { PAYMENT_METHOD_KEYS } from './paymentLabels';

interface AddPaymentSheetProps {
  open: boolean;
  method: { id: PaymentMethod; label: string };
  onClose: () => void;
}

/** Card scheme names are brands and stay as they are in both languages. */
const cardBrand = (digits: string): string => {
  if (digits.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  return 'Card';
};

const groupCard = (digits: string): string => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

const groupExpiry = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

/** Mock "add a wallet number / card" form. Nothing leaves the device; it just
    stores a masked label so the payment screen can show a saved account. */
export function AddPaymentSheet({ open, method, onClose }: AddPaymentSheetProps) {
  const t = useT();
  const addPaymentAccount = useAppStore((s) => s.addPaymentAccount);
  const toast = useAppStore((s) => s.toast);
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const isCard = method.id === 'card';
  const label = t(PAYMENT_METHOD_KEYS[method.id]);
  const cardDigits = card.replace(/\D/g, '');
  const cardOk = cardDigits.length === 15 || cardDigits.length === 16;
  const expiryOk = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidPhone(phone);
  const valid = isCard ? cardOk && expiryOk && nameOk : phoneOk;

  const save = () => {
    setTouched(true);
    if (!valid) return;
    if (isCard) {
      addPaymentAccount({
        method: 'card',
        label: cardBrand(cardDigits),
        masked: `•••• ${cardDigits.slice(-4)}`,
        isDefault: true,
      });
    } else {
      addPaymentAccount({
        method: method.id,
        label: method.label,
        masked: `0${phone.slice(0, 2)}•• •••${phone.slice(7)}`,
        isDefault: true,
      });
    }
    toast('success', t('booking.methodSaved', { label }), t('booking.methodSavedBody'));
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isCard ? t('booking.addCardTitle') : t('booking.addNumberFor', { label })}
      description={isCard ? t('booking.addCardHint') : t('booking.addNumberHint', { label })}
      footer={<Button block onClick={save}>{isCard ? t('booking.saveCard') : t('booking.saveNumber')}</Button>}
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {isCard ? (
          <>
            <Input
              label={t('booking.cardNumber')}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              value={groupCard(cardDigits)}
              onChange={(event) => setCard(event.target.value.replace(/\D/g, '').slice(0, 16))}
              error={touched && !cardOk ? t('booking.cardNumberError') : undefined}
              suffix={cardOk ? true : undefined}
              autoFocus
            />
            <div className="bk-card-row">
              <Input
                label={t('booking.expiry')}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={expiry}
                onChange={(event) => setExpiry(groupExpiry(event.target.value))}
                error={touched && !expiryOk ? t('booking.expiryError') : undefined}
              />
              <Input
                label={t('booking.nameOnCard')}
                autoComplete="cc-name"
                placeholder="A. Hassan"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={touched && !nameOk ? t('booking.nameError') : undefined}
              />
            </div>
          </>
        ) : (
          <PhoneInput
            label={t('booking.methodNumberLabel', { label })}
            value={phone}
            onChange={setPhone}
            error={touched && !phoneOk ? t('booking.phoneError') : undefined}
            autoFocus
          />
        )}
        <button type="submit" className="sr-only">{t('action.save')}</button>
      </form>
    </BottomSheet>
  );
}
