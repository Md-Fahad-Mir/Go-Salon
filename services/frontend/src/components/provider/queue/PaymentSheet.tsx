import { useState } from 'react';
import { TAKINGS_METHODS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment, TakingsMethod } from '../../../types';
import { formatBdt } from '../../../utils/format';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { TAKINGS_KEYS, servicesLabel } from './queueUtils';

interface PaymentSheetProps {
  /** Null closes the sheet; remount it with a `key` to clear the tip. */
  appointment: ProviderAppointment | null;
  onClose: () => void;
  onConfirm: (method: TakingsMethod, tip: number) => void;
}

/* Settling up is the busiest thing in the app — it happens after every single
   client, usually with the next one already waiting. So: the amount first, one
   tap for the method, and a confirm button that says what it will take. */
export function PaymentSheet({ appointment, onClose, onConfirm }: PaymentSheetProps) {
  const t = useT();
  const [method, setMethod] = useState<TakingsMethod>('cash');
  const [tip, setTip] = useState('');

  const tipValue = Math.max(0, Math.round(Number(tip.replace(/[^\d]/g, '')) || 0));
  const total = (appointment?.total ?? 0) + tipValue;
  /** The platform's cut of the bill. Never the salon's, so it is named. */
  const fee = Math.max(0, (appointment?.total ?? 0) - (appointment?.subtotal ?? 0));

  return (
    <BottomSheet
      open={Boolean(appointment)}
      onClose={onClose}
      title={t('proQueue.payTitle')}
      description={appointment ? `${appointment.customerName} · ${servicesLabel(appointment)}` : undefined}
      footer={
        <Button
          block
          size="lg"
          onClick={() => appointment && onConfirm(method, tipValue)}
        >
          {t('proQueue.payConfirm', { amount: formatBdt(total) })}
        </Button>
      }
    >
      {/* The bill is the whole of it — the customer hands over the services
          plus Eureka's booking fee. The line underneath splits the two so the
          fee is not mistaken for the salon's money later, on a screen that
          reports only the services. Not `.caption`: inside `.pq-due` every
          provider theme uppercases that with wide tracking, which is right for
          a one-word label and wrong for a sentence. */}
      <div className="pq-due">
        <span className="caption">{t('proQueue.payDue')}</span>
        <strong>{formatBdt(appointment?.total ?? 0)}</strong>
        {fee > 0 ? (
          <small className="small dim center">
            {t('proQueue.payBreakdown', {
              services: formatBdt(appointment?.subtotal ?? 0),
              fee: formatBdt(fee),
            })}
          </small>
        ) : null}
      </div>

      <p className="label">{t('proQueue.payHow')}</p>
      <div className="stack-sm" role="radiogroup" aria-label={t('proQueue.payHow')}>
        {TAKINGS_METHODS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="option"
            role="radio"
            aria-checked={method === entry.id}
            onClick={() => setMethod(entry.id)}
          >
            <span className="pq-dot" style={{ backgroundColor: `var(${entry.colorVar})` }} aria-hidden="true" />
            <span className="option-body">
              <span className="option-title">{t(TAKINGS_KEYS[entry.id])}</span>
            </span>
            <span className="radio-mark" aria-hidden="true" />
          </button>
        ))}
      </div>

      <Input
        className="pq-tip"
        label={t('proQueue.payTip')}
        hint={t('proQueue.payTipHint')}
        optional
        type="text"
        inputMode="numeric"
        value={tip}
        onChange={(event) => setTip(event.target.value.replace(/[^\d]/g, ''))}
        placeholder="0"
        icon={<span aria-hidden="true">৳</span>}
      />
    </BottomSheet>
  );
}
