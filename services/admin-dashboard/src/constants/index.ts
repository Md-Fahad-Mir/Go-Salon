import type {
  AccountStatus,
  AccountType,
  Audience,
  NotificationStatus,
  PaymentMethod,
  TransactionStatus,
  UserType,
  VerificationStatus,
  Weekday,
} from '../types';

export const ROUTES = {
  login: '/login',
  overview: '/admin',
  hairstyles: '/admin/hairstyles',
  users: '/admin/users',
  salons: '/admin/salons-barbers',
  payments: '/admin/payments',
  notifications: '/admin/notifications',
  settings: '/admin/settings',
} as const;

/** Pages that are built but hidden for now — left out of the sidebar, the
    router and the header search until they are switched back to `true`. */
export const PAGE_ENABLED = {
  payments: false,
  notifications: false,
} as const;

export const ADMIN_USER = {
  name: 'Farhana Ahmed',
  initials: 'FA',
  role: 'Platform admin',
  email: 'farhana@gosalon.app',
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

/** Role labels, for the edit form. A salon owner's role covers parlours too —
    which one they are follows from their business, not from this. */
export const USER_TYPE_LABELS: Record<UserType, string> = {
  customer: 'Customer',
  barber: 'Barber',
  salon: 'Salon / parlour owner',
  employee: 'Salon / parlour employee',
  admin: 'Admin',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  customer: 'Customer',
  barber: 'Barber',
  salon_owner: 'Salon owner',
  salon_employee: 'Salon employee',
  parlour_owner: 'Parlour owner',
  parlour_employee: 'Parlour employee',
  admin: 'Admin',
};

/** What the Users page's Type filter offers, in the order it lists them. */
export const ACCOUNT_TYPE_FILTERS: AccountType[] = [
  'customer',
  'salon_owner',
  'salon_employee',
  'parlour_owner',
  'parlour_employee',
  'admin',
];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  men: 'Men',
  women: 'Women',
  unisex: 'Everyone',
};

/** How a plan's badge is tinted. Plans are curated in Settings, so this reads
    the plan rather than a fixed table: featured ones take the champagne
    accent, free ones stay neutral, and every other paid plan is blue. */
export const tierTone = (plan: { featured: boolean; price: number }): Tone =>
  plan.featured ? 'accent' : plan.price === 0 ? 'neutral' : 'info';

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

export const TRANSACTION_STATUS_TONES: Record<TransactionStatus, Tone> = {
  completed: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'info',
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
