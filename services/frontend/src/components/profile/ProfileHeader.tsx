import { Sparkles } from 'lucide-react';
import type { User } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { formatMemberSince, formatNumber } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';

export function ProfileHeader({ user }: { user: User }) {
  const t = useT();
  return (
    <section className="pf-header" aria-label={t('profile.account')}>
      <Avatar name={user.name} src={user.avatar} size="2xl" ring />
      <h2>{user.name}</h2>
      <p className="caption">{t('profile.memberSince', { date: formatMemberSince(user.createdAt) })}</p>
      {/* The plan and what it leaves this month, as the backend last said. */}
      {user.tryOnCredits ? (
        <Badge tone="accent" plain pill>
          <Sparkles size={12} aria-hidden="true" />
          {user.tryOnCredits.remaining === null
            ? t('profile.creditsUnlimited', { plan: user.tryOnCredits.plan.name })
            : t('profile.credits', {
                count: user.tryOnCredits.remaining,
                value: formatNumber(user.tryOnCredits.remaining),
                plan: user.tryOnCredits.plan.name,
              })}
        </Badge>
      ) : null}
    </section>
  );
}
