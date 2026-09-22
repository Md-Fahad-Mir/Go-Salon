import type {
  AccountStatus,
  BookingStatus,
  ModerationStatus,
  NotificationStatus,
  PaymentMethod,
  SubscriptionTier,
  TransactionStatus,
  UserType,
  VerificationStatus,
  Weekday,
} from '../types';

export const ROUTES = {
  overview: '/admin',
  hairstyles: '/admin/hairstyles',
  users: '/admin/users',
  salons: '/admin/salons-barbers',
  moderation: '/admin/moderation',
  payments: '/admin/payments',
  bookings: '/admin/bookings',
  notifications: '/admin/notifications',
  settings: '/admin/settings',
  auditLog: '/admin/audit-log',
} as const;

export const ADMIN_USER = {
  name: 'Farhana Ahmed',
  initials: 'FA',
  role: 'Platform admin',
  email: 'farhana@eureka.app',
} as const;

export const HAIRSTYLE_CATEGORIES = [
  'Haircut',
  'Coloring',
  'Styling',
  'Treatment',
  'Braiding',
  'Beard',
  'Bridal',
  'Other',
] as const;

export const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DHAKA_AREAS = [
  'Dhanmondi',
  'Gulshan',
  'Uttara',
  'Mirpur',
  'Banani',
  'Bashundhara',
  'Mohammadpur',
  'Old Dhaka',
] as const;

/* --- Label + tone lookups -------------------------------------------------
   Every status renders through these so colour is never the only signal:
   each badge carries its written label too. */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export const USER_TYPE_LABELS: Record<UserType, string> = {
  customer: 'Customer',
  barber: 'Barber',
  salon: 'Salon owner',
  employee: 'Salon employee',
  admin: 'Admin',
};

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  basic: 'Basic',
  advanced: 'Advanced',
};

export const TIER_TONES: Record<SubscriptionTier, Tone> = {
  free: 'neutral',
  basic: 'info',
  advanced: 'accent',
};

export const ACCOUNT_STATUS_TONES: Record<AccountStatus, Tone> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
};

export const VERIFICATION_TONES: Record<VerificationStatus, Tone> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
};

export const BOOKING_STATUS_TONES: Record<BookingStatus, Tone> = {
  pending: 'warning',
  approved: 'info',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  rescheduled: 'accent',
};

export const TRANSACTION_STATUS_TONES: Record<TransactionStatus, Tone> = {
  completed: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'info',
};

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_info: 'Needs info',
};

export const MODERATION_STATUS_TONES: Record<ModerationStatus, Tone> = {
  under_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  needs_info: 'info',
};

export const NOTIFICATION_STATUS_TONES: Record<NotificationStatus, Tone> = {
  sent: 'success',
  scheduled: 'info',
  failed: 'danger',
  bounced: 'warning',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'Card',
};

export const PAYMENT_METHOD_VARS: Record<PaymentMethod, string> = {
  bkash: 'var(--pay-bkash)',
  nagad: 'var(--pay-nagad)',
  rocket: 'var(--pay-rocket)',
  card: 'var(--pay-card)',
};

export const NOTIFICATION_TYPES = [
  'Booking approved',
  'Booking declined',
  'Booking reminder',
  'Payment receipt',
  'Payment reminder',
  'OTP verification',
  'Subscription renewal',
] as const;

export const PAGE_SIZES = [10, 25, 50] as const;
