import { DEFAULT_CANCELLATION_HOURS } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';

interface PolicySheetProps {
  open: boolean;
  onClose: () => void;
}

export function PolicySheet({ open, onClose }: PolicySheetProps) {
  const t = useT();
  const lines = [
    t('booking.policy1', { hours: formatNumber(DEFAULT_CANCELLATION_HOURS) }),
    t('booking.policy2'),
    t('booking.policy3'),
  ];
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('booking.cancellationPolicy')}
      description={t('booking.policyIntro')}
      footer={<Button block onClick={onClose}>{t('booking.gotIt')}</Button>}
    >
      <ol className="checklist bk-policy">
        {lines.map((line, index) => (
          <li key={line}>
            <span className="num" aria-hidden="true">{formatNumber(index + 1)}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </BottomSheet>
  );
}
