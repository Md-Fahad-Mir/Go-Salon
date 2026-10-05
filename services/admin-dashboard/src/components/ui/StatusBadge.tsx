import type {
  AccountStatus,
  EntityStatus,
  NotificationStatus,
  SubscriptionTier,
  SubscriptionTierPlan,
  TransactionStatus,
  VerificationStatus,
} from '../../types';
import {
  ACCOUNT_STATUS_TONES,
  NOTIFICATION_STATUS_TONES,
  tierTone,
  TRANSACTION_STATUS_TONES,
  VERIFICATION_TONES,
} from '../../constants';
import { titleCase } from '../../utils/format';
import { Badge } from './Badge';

export const AccountStatusBadge = ({ status }: { status: AccountStatus }) => (
  <Badge tone={ACCOUNT_STATUS_TONES[status]}>{titleCase(status)}</Badge>
);

export const EntityStatusBadge = ({ status }: { status: EntityStatus }) => (
  <Badge tone={status === 'active' ? 'success' : 'neutral'}>{titleCase(status)}</Badge>
);

export const VerificationBadge = ({ status }: { status: VerificationStatus }) => (
  <Badge tone={VERIFICATION_TONES[status]}>{titleCase(status)}</Badge>
);

export const TransactionStatusBadge = ({ status }: { status: TransactionStatus }) => (
  <Badge tone={TRANSACTION_STATUS_TONES[status]}>{titleCase(status)}</Badge>
);

export const NotificationStatusBadge = ({ status }: { status: NotificationStatus }) => (
  <Badge tone={NOTIFICATION_STATUS_TONES[status]}>{titleCase(status)}</Badge>
);

/** An account's plan, named from the tiers curated in Settings. Until those
    have loaded — or if they could not be — the slug stands in for the name. */
export const TierBadge = ({ tier, plans }: { tier: SubscriptionTier; plans: SubscriptionTierPlan[] }) => {
  const plan = plans.find((item) => item.slug === tier);
  return <Badge tone={plan ? tierTone(plan) : 'neutral'}>{plan?.name ?? titleCase(tier)}</Badge>;
};
