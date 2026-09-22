import { Check, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { PaymentMethod } from '../../types';
import { CREDIT_PACK_PRICE, CREDIT_PACK_SIZE, PAYMENT_METHODS } from '../../constants';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiError, api } from '../../utils/api';
import { formatBdt, formatNumber } from '../../utils/format';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Price } from '../common/Price';

type Phase = 'pick' | 'paying' | 'success' | 'failed';

const METHODS = PAYMENT_METHODS.filter((m) => m.id !== 'rocket');

/* PAYMENT_METHODS in src/constants is English: the wallet names and their
   one-line hints are read from the dictionary instead. */
const METHOD_KEYS: Record<PaymentMethod, TKey> = {
  bkash: 'tryon.methodBkash',
  nagad: 'tryon.methodNagad',
  rocket: 'tryon.methodRocket',
  card: 'tryon.methodCard',
};

const METHOD_HINT_KEYS: Record<PaymentMethod, TKey> = {
  bkash: 'tryon.payHintMobile',
  nagad: 'tryon.payHintMobile',
  rocket: 'tryon.payHintMobile',
  card: 'tryon.payHintCard',
};

interface BuyCreditsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful top-up when the user taps Done. */
  onPurchased?: () => void;
}

/** "Top up credits" — pick a wallet, pay, land on a success or failure view. */
export function BuyCreditsSheet({ open, onClose, onPurchased }: BuyCreditsSheetProps) {
  const t = useT();
  const credits = useAppStore((s) => s.user?.credits ?? 0);
  const addCredits = useAppStore((s) => s.addCredits);
  const toast = useAppStore((s) => s.toast);
  const [method, setMethod] = useState<PaymentMethod>('bkash');
  const [phase, setPhase] = useState<Phase>('pick');
  const [errorKey, setErrorKey] = useState<TKey | null>(null);

  const close = () => {
    if (phase === 'paying') return;
    setPhase('pick');
    setErrorKey(null);
    onClose();
  };

  const pay = async () => {
    setPhase('paying');
    setErrorKey(null);
    try {
      const { added } = await api.credits.purchase(method);
      addCredits(added);
      toast(
        'success',
        t('tryon.creditsAdded', { count: added, value: formatNumber(added) }),
        t('tryon.creditsAddedBody'),
      );
      setPhase('success');
    } catch (err) {
      const declined = err instanceof ApiError && err.code === 'payment_failed';
      setErrorKey(
        declined
          ? method === 'card'
            ? 'tryon.paymentDeclinedCard'
            : 'tryon.paymentDeclinedWallet'
          : 'tryon.paymentError',
      );
      setPhase('failed');
    }
  };

  const finish = () => {
    setPhase('pick');
    onClose();
    onPurchased?.();
  };

  const label = t(METHOD_KEYS[method]);

  if (phase === 'success') {
    return (
      <BottomSheet open={open} onClose={close} closeButton={false}>
        <div className="tryon-result" role="status">
          <span className="icon-circle icon-circle-success">
            <Check size={30} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <h2>{t('tryon.creditsAdded', { count: CREDIT_PACK_SIZE, value: formatNumber(CREDIT_PACK_SIZE) })}</h2>
          <p className="caption">{t('tryon.creditsBalance', { count: credits, value: formatNumber(credits) })}</p>
          <Button block onClick={finish} className="mt-2">
            {t('action.done')}
          </Button>
        </div>
      </BottomSheet>
    );
  }

  if (phase === 'failed') {
    return (
      <BottomSheet open={open} onClose={close} closeButton={false}>
        <div className="tryon-result" role="alert">
          <span className="icon-circle icon-circle-danger">
            <XCircle size={30} aria-hidden="true" />
          </span>
          <h2>{t('tryon.paymentFailedTitle')}</h2>
          <p className="caption">{t(errorKey ?? 'tryon.paymentError')}</p>
          <div className="stack-sm full mt-2">
            <Button block onClick={pay}>
              {t('action.retry')}
            </Button>
            <Button block variant="ghost" onClick={() => setPhase('pick')}>
              {t('tryon.changeMethod')}
            </Button>
          </div>
        </div>
      </BottomSheet>
    );
  }

  const paying = phase === 'paying';

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('tryon.topUpTitle')}
      description={paying ? t('tryon.openingMethod', { method: label }) : t('tryon.creditHint')}
      dismissible={!paying}
      footer={
        <Button block size="lg" loading={paying} onClick={pay}>
          {t('tryon.payAmount', { amount: formatBdt(CREDIT_PACK_PRICE) })}
        </Button>
      }
    >
      <div className="stack">
        <Card className="tryon-pack-card">
          <div className="tryon-pack">
            <div>
              <div className="tryon-pack-title">
                {t('tryon.packCredits', { count: CREDIT_PACK_SIZE, value: formatNumber(CREDIT_PACK_SIZE) })}
              </div>
              <p className="small muted">{t('tryon.packHint')}</p>
            </div>
            <Price value={CREDIT_PACK_PRICE} size="lg" accent />
          </div>
        </Card>
        <div className="stack-sm tryon-pay" role="radiogroup" aria-label={t('tryon.payWith')}>
          {METHODS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              className="option"
              aria-checked={method === item.id}
              disabled={paying}
              onClick={() => setMethod(item.id)}
            >
              <span className="radio-mark" aria-hidden="true" />
              <span className="tryon-pay-dot" data-method={item.id} aria-hidden="true" />
              <span className="option-body">
                <span className="option-title">{t(METHOD_KEYS[item.id])}</span>
                <span className="option-sub">{t(METHOD_HINT_KEYS[item.id])}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
