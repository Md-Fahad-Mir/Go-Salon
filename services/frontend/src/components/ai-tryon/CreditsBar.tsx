import type { CSSProperties } from 'react';
import type { TryOnCredits } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { renewsOn } from '../../utils/creditsService';
import { formatNumber } from '../../utils/format';
import { Button } from '../common/Button';
import { CreditsPill } from './CreditsPill';

interface CreditsBarProps {
  credits: TryOnCredits | undefined;
  /** Opens the plans; left out, there is no button. */
  onUpgrade?: () => void;
}

/** The balance on its rail — the pill, the plan it comes from, and a way to
    a bigger plan — with this month's usage spelled out underneath. */
export function CreditsBar({ credits, onUpgrade }: CreditsBarProps) {
  const t = useT();
  const unlimited = credits?.remaining === null;

  return (
    <div className="tryon-credit-block">
      <div className="between tryon-bar">
        <div className="tryon-credit-main">
          <CreditsPill credits={credits} />
          {credits ? (
            <span className="tryon-credit-plan">{t('tryon.planName', { plan: credits.plan.name })}</span>
          ) : null}
        </div>
        {onUpgrade && credits && !unlimited ? (
          <Button variant="ghost" size="sm" onClick={onUpgrade}>
            {t('tryon.upgradePlan')}
          </Button>
        ) : null}
      </div>
      {credits && credits.total ? (
        // How much of the month is gone, for the eye; the line below says it.
        <span
          className="tryon-credit-meter"
          aria-hidden="true"
          style={{ '--used': Math.min(1, credits.used / credits.total) } as CSSProperties}
        />
      ) : null}
      {credits ? (
        <p className="tryon-credit-usage">
          {credits.total === null
            ? t('tryon.creditsUsedUnlimited', { count: credits.used, value: formatNumber(credits.used) })
            : t('tryon.creditsUsedOf', { used: formatNumber(credits.used), total: formatNumber(credits.total) })}
          {credits.total === null ? null : (
            <>
              {' · '}
              {t('tryon.creditsRenew', { date: renewsOn(credits) })}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
