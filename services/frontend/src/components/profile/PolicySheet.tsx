import { DEFAULT_CANCELLATION_HOURS } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { formatNumber } from '../../utils/format';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';

interface PolicySheetProps {
  open: boolean;
  onClose: () => void;
}

const POLICY_KEYS: TKey[] = ['profile.policy1', 'profile.policy2', 'profile.policy3'];

export function PolicySheet({ open, onClose }: PolicySheetProps) {
  const t = useT();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('profile.policyTitle')}
      description={t('profile.policySubtitle')}
      footer={<Button variant="secondary" block onClick={onClose}>{t('profile.gotIt')}</Button>}
    >
      <ol className="checklist pf-policy-list">
        {POLICY_KEYS.map((key, index) => (
          <li key={key}>
            <span className="num" aria-hidden="true">{formatNumber(index + 1)}</span>
            <span>{t(key, { hours: formatNumber(DEFAULT_CANCELLATION_HOURS) })}</span>
          </li>
        ))}
      </ol>
    </BottomSheet>
  );
}
