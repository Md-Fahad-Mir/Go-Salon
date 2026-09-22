import type {
  AccountStatus,
  BookingStatus,
  EntityStatus,
  ModerationStatus,
  NotificationStatus,
  SubscriptionTier,
  TransactionStatus,
  VerificationStatus,
} from '../../types';
import {
  ACCOUNT_STATUS_TONES,
  BOOKING_STATUS_TONES,
  MODERATION_STATUS_LABELS,
  MODERATION_STATUS_TONES,
  NOTIFICATION_STATUS_TONES,
  TIER_LABELS,
  TIER_TONES,
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

export const BookingStatusBadge = ({ status }: { status: BookingStatus }) => (
  <Badge tone={BOOKING_STATUS_TONES[status]}>{titleCase(status)}</Badge>
);

export const TransactionStatusBadge = ({ status }: { status: TransactionStatus }) => (
  <Badge tone={TRANSACTION_STATUS_TONES[status]}>{titleCase(status)}</Badge>
);

export const ModerationStatusBadge = ({ status }: { status: ModerationStatus }) => (
  <Badge tone={MODERATION_STATUS_TONES[status]}>{MODERATION_STATUS_LABELS[status]}</Badge>
);

export const NotificationStatusBadge = ({ status }: { status: NotificationStatus }) => (
  <Badge tone={NOTIFICATION_STATUS_TONES[status]}>{titleCase(status)}</Badge>
);

export const TierBadge = ({ tier }: { tier: SubscriptionTier }) => (
  <Badge tone={TIER_TONES[tier]}>{TIER_LABELS[tier]}</Badge>
);
