import { Sparkles } from 'lucide-react';
import type { TryOnCredits } from '../../types';
import { Badge } from '../common/Badge';
import { Skeleton } from '../common/Skeleton';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';

/** "7 credits left" from the plan's monthly allowance — "Unlimited try-ons"
    on a plan without one, and red "No credits" once the month's are spent. */
export function CreditsPill({ credits }: { credits: TryOnCredits | undefined }) {
  const t = useT();
  if (!credits) return <Skeleton width="7.5rem" height="1.875rem" radius="var(--radius-pill)" />;
  if (credits.remaining === null) {
    return (
      <Badge tone="accent" plain pill className="tryon-credits">
        <Sparkles size={14} aria-hidden="true" /> {t('tryon.creditsUnlimited')}
      </Badge>
    );
  }
  if (credits.remaining <= 0) {
    return (
      <Badge tone="danger" plain pill className="tryon-credits">
        <Sparkles size={14} aria-hidden="true" /> {t('tryon.noCredits')}
      </Badge>
    );
  }
  return (
    <Badge tone="accent" plain pill className="tryon-credits">
      <Sparkles size={14} aria-hidden="true" />{' '}
      {t('tryon.creditsLeft', { count: credits.remaining, value: formatNumber(credits.remaining) })}
    </Badge>
  );
}
