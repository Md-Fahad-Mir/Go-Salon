import { CreditCard, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { PaymentAccount, PaymentMethod } from '../../types';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import type { TFunction } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { isValidPhone } from '../../utils/validators';
import { ActionSheet } from '../common/ActionSheet';
import { Badge } from '../common/Badge';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { IconButton } from '../common/IconButton';
import { Input } from '../common/Input';
import { ListCard, ListRow } from '../common/ListRow';
import { PhoneInput } from '../common/PhoneInput';
import { Segmented } from '../common/Tabs';

const METHOD_TABS = PAYMENT_METHODS.map((m) => ({ id: m.id, label: m.label }));

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

const expiryError = (value: string, t: TFunction): string | undefined => {
  if (value.length < 5) return undefined;
  const [mm, yy] = value.split('/').map(Number);
  if (!mm || mm < 1 || mm > 12) return t('settings.expiryMonthError');
  const now = new Date();
  const year = 2000 + yy;
  if (year < now.getFullYear() || (year === now.getFullYear() && mm < now.getMonth() + 1)) {
    return t('settings.cardExpired');
  }
  return undefined;
};

interface AddPaymentSheetProps {
  onClose: () => void;
  onSave: (account: Omit<PaymentAccount, 'id' | 'isDefault'>) => void;
}

function AddPaymentSheet({ onClose, onSave }: AddPaymentSheetProps) {
  const [method, setMethod] = useState<PaymentMethod>('bkash');
  const [phone, setPhone] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cardName, setCardName] = useState('');
  const t = useT();

  const isWallet = method !== 'card';
  const cardDigits = cardNumber.replace(/\D/g, '');
  const walletValid = isValidPhone(phone);
  const cardValid = cardDigits.length >= 15 && expiry.length === 5 && !expiryError(expiry, t) && cardName.trim().length >= 2;
  const valid = isWallet ? walletValid : cardValid;

  const save = () => {
    if (!valid) return;
    if (isWallet) {
      onSave({
        method,
        label: PAYMENT_METHOD_LABELS[method],
        masked: `0${phone.slice(0, 2)}•• •••${phone.slice(7)}`,
      });
    } else {
      onSave({ method: 'card', label: cardBrand(cardDigits), masked: `•••• ${cardDigits.slice(-4)}` });
    }
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('settings.addPayment')}
      description={t('settings.addPaymentSubtitle')}
      footer={<Button block onClick={save} disabled={!valid}>{t('action.save')}</Button>}
    >
      <div className="stack">
        <Segmented tabs={METHOD_TABS} active={method} onChange={setMethod} label={t('settings.paymentMethodLabel')} />
        {isWallet ? (
          <PhoneInput
            label={t('settings.walletNumber', { method: PAYMENT_METHOD_LABELS[method] })}
            value={phone}
            onChange={setPhone}
            hint={t('settings.walletHint')}
          />
        ) : (
          <>
            <Input
              label={t('settings.cardNumber')}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              value={groupCard(cardDigits)}
              onChange={(event) => setCardNumber(event.target.value.replace(/\D/g, '').slice(0, 16))}
              icon={<CreditCard size={18} aria-hidden="true" />}
              suffix={cardDigits.length >= 15 ? true : undefined}
            />
            <div className="grid-2">
              <Input
                label={t('settings.expiry')}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={expiry}
                onChange={(event) => setExpiry(groupExpiry(event.target.value))}
                error={expiryError(expiry, t)}
              />
              <Input
                label={t('settings.nameOnCard')}
                autoComplete="cc-name"
                placeholder="A. Hassan"
                value={cardName}
                onChange={(event) => setCardName(event.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/** Saved wallets and cards, with add / make default / remove. */
export function PaymentAccountsSection() {
  const accounts = useAppStore((s) => s.paymentAccounts);
  const addPaymentAccount = useAppStore((s) => s.addPaymentAccount);
  const setDefaultPaymentAccount = useAppStore((s) => s.setDefaultPaymentAccount);
  const removePaymentAccount = useAppStore((s) => s.removePaymentAccount);
  const toast = useAppStore((s) => s.toast);
  const [menuFor, setMenuFor] = useState<PaymentAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const t = useT();

  const save = (account: Omit<PaymentAccount, 'id' | 'isDefault'>) => {
    addPaymentAccount({ ...account, isDefault: accounts.length === 0 });
    setAdding(false);
    toast('success', t('settings.paymentAdded', { label: account.label }), account.masked);
  };

  return (
    <section className="section" aria-labelledby="pf-payments">
      <h3 className="label" id="pf-payments">{t('settings.payments')}</h3>
      {/* `pf-card-keep`: a saved wallet or card is a thing a customer owns, not
          a preference, so this one group keeps a body on the settings screen. */}
      <ListCard className="pf-list pf-card-keep">
        {accounts.map((account) => (
          <div key={account.id} className="list-row pf-pay-row">
            <span className="pf-pay-dot" data-method={account.method} aria-hidden="true" />
            <span className="list-row-body">
              <span className="list-row-title">{account.label}</span>
              <span className="list-row-sub">{account.masked}</span>
            </span>
            <span className="list-row-end">
              {account.isDefault ? <Badge tone="accent" plain pill>{t('settings.default')}</Badge> : null}
              <IconButton
                label={t('settings.paymentOptions', { label: account.label, masked: account.masked })}
                onClick={() => setMenuFor(account)}
              >
                <MoreHorizontal size={20} />
              </IconButton>
            </span>
          </div>
        ))}
        {accounts.length === 0 ? (
          <div className="list-row">
            <span className="list-row-body">
              <span className="list-row-sub">{t('settings.noPayments')}</span>
            </span>
          </div>
        ) : null}
        <ListRow icon={<Plus size={18} aria-hidden="true" />} title={t('settings.addPayment')} onClick={() => setAdding(true)} />
      </ListCard>

      <ActionSheet
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor ? `${menuFor.label} ${menuFor.masked}` : undefined}
        actions={[
          {
            label: t('settings.makeDefault'),
            icon: <Star size={18} aria-hidden="true" />,
            disabled: menuFor?.isDefault ?? false,
            onSelect: () => {
              if (!menuFor) return;
              setDefaultPaymentAccount(menuFor.id);
              toast('success', t('settings.defaultUpdated'), `${menuFor.label} ${menuFor.masked}`);
            },
          },
          {
            label: t('profile.remove'),
            icon: <Trash2 size={18} aria-hidden="true" />,
            danger: true,
            onSelect: () => {
              if (!menuFor) return;
              removePaymentAccount(menuFor.id);
              toast('info', t('settings.paymentRemoved'), `${menuFor.label} ${menuFor.masked}`);
            },
          },
        ]}
      />

      {adding ? <AddPaymentSheet onClose={() => setAdding(false)} onSave={save} /> : null}
    </section>
  );
}
