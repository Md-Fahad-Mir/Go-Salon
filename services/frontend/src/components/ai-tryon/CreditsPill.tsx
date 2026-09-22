import { Sparkles } from 'lucide-react';
import { Badge } from '../common/Badge';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';

/** "7 credits left" — turns red and reads "No credits" when the balance is empty. */
export function CreditsPill({ credits }: { credits: number }) {
  const t = useT();
  if (credits <= 0) {
    return (
      <Badge tone="danger" plain pill className="tryon-credits">
        <Sparkles size={14} aria-hidden="true" /> {t('tryon.noCredits')}
      </Badge>
    );
  }
  return (
    <Badge tone="accent" plain pill className="tryon-credits">
      <Sparkles size={14} aria-hidden="true" />{' '}
      {t('tryon.creditsLeft', { count: credits, value: formatNumber(credits) })}
    </Badge>
  );
}
