import { Check } from 'lucide-react';
import { useState } from 'react';
import { TAKINGS_METHODS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment, TakingsMethod } from '../../../types';
import { formatBdt } from '../../../utils/format';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { TAKINGS_KEYS } from './salonLabels';

interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  appointment: ProviderAppointment | null;
  onConfirm: (method: TakingsMethod, tip?: number) => void;
}

/** Closing a client out: how the money arrived and whether they left a tip.
    Mount this with a `key` of the appointment id so each client starts on
    cash rather than inheriting the last one's answer. */
export function PaymentSheet({ open, onClose, appointment, onConfirm }: PaymentSheetProps) {
  const t = useT();
  const [method, setMethod] = useState<TakingsMethod>('cash');
  const [tip, setTip] = useState('');

  if (!appointment) return null;

  const tipValue = Math.max(0, Math.round(Number(tip) || 0));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.paymentTitle')}
      description={t('salon.paymentFor', {
        name: appointment.customerName,
        amount: formatBdt(appointment.total),
      })}
      footer={
        <Button
          block
          onClick={() => {
            onConfirm(method, tipValue || undefined);
            onClose();
          }}
        >
          {t('salon.confirmPayment')}
        </Button>
      }
    >
      <div className="stack">
        <div className="stack-sm" role="radiogroup" aria-label={t('salon.paymentTitle')}>
          {TAKINGS_METHODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="ps-pick"
              role="radio"
              aria-checked={method === entry.id}
              onClick={() => setMethod(entry.id)}
            >
              <span className="ps-split-dot" style={{ backgroundColor: `var(${entry.colorVar})` }} aria-hidden="true" />
              <span className="ps-pick-body">
                <span className="ps-pick-name">{t(TAKINGS_KEYS[entry.id])}</span>
              </span>
              {method === entry.id ? (
                <Check size={18} aria-hidden="true" style={{ color: 'var(--accent-ink)' }} />
              ) : null}
            </button>
          ))}
        </div>

        <Input
          label={t('salon.tipLabel')}
          hint={t('salon.tipHint')}
          type="number"
          inputMode="numeric"
          min={0}
          step={10}
          value={tip}
          onChange={(event) => setTip(event.target.value)}
          suffix={<span className="ps-suffix">{t('salon.takaUnit')}</span>}
          optional
        />
      </div>
    </BottomSheet>
  );
}
