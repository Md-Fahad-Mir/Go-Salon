import { AlertTriangle, Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SubscriptionPlan, TryOnCredits } from '../../types';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { creditsService, renewsOn } from '../../utils/creditsService';
import { cn } from '../../utils/cn';
import { formatBdt, formatNumber } from '../../utils/format';
import { Badge } from '../common/Badge';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/Skeleton';

interface PlansSheetProps {
  open: boolean;
  onClose: () => void;
  credits: TryOnCredits | undefined;
}

/** The plans, as the admin has them — what each costs and how many try-ons a
    month it brings — with the account's own marked.

    Moving plan is the Go Salon team's to do until the app takes payments, so
    the way forward is a conversation, not a checkout: the sheet ends at Help,
    where WhatsApp, email and phone are. */
export function PlansSheet({ open, onClose, credits }: PlansSheetProps) {
  const t = useT();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    creditsService
      .plans()
      .then((data) => {
        if (live) setPlans(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [open, attempt]);

  const retry = () => {
    setFailed(false);
    setPlans(null);
    setAttempt((n) => n + 1);
  };

  const spent = credits?.remaining === 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={spent ? t('tryon.plansOutTitle') : t('tryon.plansTitle')}
      description={
        spent && credits
          ? t('tryon.plansOutBody', { plan: credits.plan.name, date: renewsOn(credits) })
          : t('tryon.plansIntro')
      }
      footer={
        <div className="stack-sm">
          <p className="caption center">{t('tryon.plansHowTo')}</p>
          <Button
            block
            size="lg"
            onClick={() => {
              onClose();
              navigate(ROUTES.help);
            }}
          >
            {t('tryon.plansContact')}
          </Button>
        </div>
      }
    >
      {failed ? (
        <EmptyState
          icon={<AlertTriangle size={24} aria-hidden="true" />}
          title={t('state.loadFailedTitle')}
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              {t('state.retry')}
            </Button>
          }
        />
      ) : !plans ? (
        <div className="stack-sm" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} height="7.5rem" radius="var(--tryon-radius)" />
          ))}
        </div>
      ) : (
        <ul className="stack-sm tryon-plans">
          {plans.map((plan) => {
            const current = plan.slug === credits?.plan.slug;
            return (
              <li
                key={plan.slug}
                className={cn('tryon-plan', current && 'is-current', plan.featured && 'is-featured')}
                aria-current={current || undefined}
              >
                <div className="tryon-plan-head">
                  <div className="tryon-plan-title">
                    <strong>{plan.name}</strong>
                    {current ? (
                      <Badge tone="accent" plain pill>
                        {t('tryon.planCurrent')}
                      </Badge>
                    ) : plan.featured ? (
                      <Badge tone="neutral" plain pill>
                        {t('tryon.planPopular')}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="tryon-plan-price">
                    {formatBdt(plan.price)}
                    <small> {t('tryon.planPerMonth')}</small>
                  </span>
                </div>
                <p className="tryon-plan-credits">
                  <Sparkles size={14} aria-hidden="true" />
                  {plan.monthlyCredits === null
                    ? t('tryon.creditsUnlimited')
                    : t('tryon.planCredits', {
                        count: plan.monthlyCredits,
                        value: formatNumber(plan.monthlyCredits),
                      })}
                </p>
                {plan.features.length ? (
                  <ul className="tryon-plan-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={14} aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
