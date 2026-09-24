import type {
  AccountType,
  AppointmentStage,
  BookingStatus,
  FaceShape,
  HairLength,
  HairType,
  Occasion,
  PaymentMethod,
  PayoutMethod,
  ProviderRole,
  RegistrableAccountType,
  TakingsMethod,
  UserRole,
  Weekday,
} from '../types';

export const ROUTES = {
  root: '/',
  welcome: '/welcome',
  login: '/auth/login',
  otp: '/auth/otp',
  /* Sign-up. `/auth/register` is the account-type chooser; each type has its
     own page under it, so a link can drop someone straight into one. */
  register: '/auth/register',
  registerCustomer: '/auth/register/customer',
  registerBarber: '/auth/register/barber',
  registerSalonOwner: '/auth/register/salon-owner',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  changePassword: '/profile/password',
  /* Admin accounts are internal; the tools are Django's admin site, and this
     screen is where a signed-in admin is pointed at them. */
  adminHome: '/admin-console',
  home: '/home',
  notifications: '/notifications',
  hairstyle: (id: string) => `/hairstyle/${id}`,
  professional: (id: string) => `/professional/${id}`,
  professionalReviews: (id: string) => `/professional/${id}/reviews`,
  bookingService: (id: string) => `/booking/${id}/service`,
  bookingStaff: (id: string) => `/booking/${id}/staff`,
  bookingDateTime: (id: string) => `/booking/${id}/datetime`,
  bookingSummary: (id: string) => `/booking/${id}/summary`,
  bookingConfirmation: (id: string) => `/booking/confirmation/${id}`,
  /* What a shop's printed QR code resolves to. The backend builds the same
     string from `JOIN_URL_BASE`, so the two have to agree character for
     character or every code already on a wall stops working. */
  join: (token: string) => `/join/${token}`,
  bookings: '/bookings',
  bookingDetail: (id: string) => `/bookings/${id}`,

  /* --- Provider app. Everything a professional does lives under /pro. --- */
  proQueue: '/pro/queue',
  proCalendar: '/pro/calendar',
  proServices: '/pro/services',
  proPortfolio: '/pro/portfolio',
  proEarnings: '/pro/earnings',
  proProfile: '/pro/profile',
  proAppointment: (id: string) => `/pro/appointment/${id}`,
  /* Two destinations every professional's bar ends up at, whatever their
     role: the bookings waiting on an answer, and the app's own settings. */
  proRequests: '/pro/requests',
  proSettings: '/pro/settings',
  /* Salon owner */
  proSalonQueue: '/pro/salon/queue',
  proSalonStaff: '/pro/salon/staff',
  proSalonStaffMember: (id: string) => `/pro/salon/staff/${id}`,
  proSalonServices: '/pro/salon/services',
  proSalonProfile: '/pro/salon/profile',
  proSalonAnalytics: '/pro/salon/analytics',
  /* Salon employee */
  proShift: '/pro/shift',
  proPerformance: '/pro/performance',
  /* Women's salon stylist */
  proClients: '/pro/clients',
  proClient: (id: string) => `/pro/clients/${id}`,
  proTreatments: '/pro/treatments',
  proLookbook: '/pro/lookbook',
  tryOn: '/ai-tryon',
  tryOnUpload: '/ai-tryon/upload',
  tryOnCapture360: '/ai-tryon/capture-360',
  tryOnSelect: '/ai-tryon/select',
  tryOnPreview: (id: string) => `/ai-tryon/preview/${id}`,
  tryOnHistory: '/ai-tryon/history',
  profile: '/profile',
  profileEdit: '/profile/edit',
  profileReviews: '/profile/reviews',
  profileSettings: '/profile/settings',
  help: '/profile/help',
  terms: '/profile/terms',
  privacy: '/profile/privacy',
} as const;

/** Code length and resend cooldown. The backend is the authority on both —
    it returns `resend_in` with every code it sends — and these are the
    fallbacks used before the first answer comes back. */
export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 60;

/** The photograph the AI try-on hero compares against itself.
 *
 *  One constant on purpose: this is the only line to change to swap the
 *  picture. Drop a file at `public/ai-hero.jpg` and it is picked up from
 *  `/ai-hero.jpg`; point it at any https URL and that is used instead.
 *
 *  The shipped photograph is StockSnap `LXQU6N0DL9` ("People Man"), CC0 1.0 —
 *  public domain, commercial use, no attribution required.
 *  https://stocksnap.io/photo/people-man-LXQU6N0DL9
 *
 *  A replacement wants a head-and-shoulders portrait, landscape-ish, with a
 *  clearly styled cut and the face a little left of centre.
 */
export const AI_HERO_PHOTO = '/ai-hero.jpg';

/** The home screen's try-on teaser. A different face from `AI_HERO_PHOTO` on
 *  purpose — the same photograph twice, two screens apart, reads as a stock
 *  placeholder rather than a product.
 *
 *  StockSnap `ILP6CFYHQI`, CC0 1.0 — public domain, commercial use, no
 *  attribution required. https://stocksnap.io/photo/woman-hair-ILP6CFYHQI
 */
export const AI_HOME_PHOTO = '/ai-home.jpg';

/** Platform fee added to every booking, in BDT. */
export const PLATFORM_FEE = 50;
/** Credits a brand-new account starts with, and the size of a top-up. */
export const STARTING_CREDITS = 3;
export const CREDIT_PACK_SIZE = 10;
export const CREDIT_PACK_PRICE = 199;

export const SLOT_INTERVAL_MINUTES = 30;
export const BOOKING_HORIZON_DAYS = 30;

/** Default centre used before the user shares a location: Dhanmondi, Dhaka. */
export const DEFAULT_LOCATION = {
  lat: 23.7461,
  lng: 90.3742,
  area: 'Dhanmondi',
  city: 'Dhaka',
  address: 'Road 27, Dhanmondi, Dhaka 1209',
} as const;

export const DHAKA_AREAS = [
  'Dhanmondi',
  'Gulshan',
  'Banani',
  'Uttara',
  'Mirpur',
  'Bashundhara',
  'Mohammadpur',
  'Old Dhaka',
] as const;

export const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export const HAIR_TYPES: Array<{ id: HairType; label: string; hint: string }> = [
  { id: 'straight', label: 'Straight', hint: 'Lies flat, little natural bend' },
  { id: 'wavy', label: 'Wavy', hint: 'Loose S-shaped bends' },
  { id: 'curly', label: 'Curly', hint: 'Defined spirals and ringlets' },
  { id: 'coily', label: 'Coily', hint: 'Tight coils and zig-zags' },
];

export const HAIR_LENGTHS: Array<{ id: HairLength; label: string; hint: string }> = [
  { id: 'short', label: 'Short', hint: 'Above the ears' },
  { id: 'medium', label: 'Medium', hint: 'Ears to shoulders' },
  { id: 'long', label: 'Long', hint: 'Past the shoulders' },
];

export const OCCASIONS: Array<{ id: Occasion; label: string }> = [
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'party', label: 'Party' },
  { id: 'business', label: 'Business' },
  { id: 'date', label: 'Date night' },
];

export const FACE_SHAPE_LABELS: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  oblong: 'Oblong',
};

export const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  hint: string;
  colorVar: string;
}> = [
  { id: 'bkash', label: 'bKash', hint: 'Mobile money', colorVar: 'var(--pay-bkash)' },
  { id: 'nagad', label: 'Nagad', hint: 'Mobile money', colorVar: 'var(--pay-nagad)' },
  { id: 'rocket', label: 'Rocket', hint: 'Mobile money', colorVar: 'var(--pay-rocket)' },
  { id: 'card', label: 'Card', hint: 'Visa, Mastercard, Amex', colorVar: 'var(--pay-card)' },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'Card',
};

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'sage' | 'coral';


export const BOOKING_STATUS_TONES: Record<BookingStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  completed: 'neutral',
  cancelled: 'danger',
  rescheduled: 'neutral',
};

export const FEASIBILITY_LABELS = {
  easy: 'Easy from your current hair',
  moderate: 'A few sessions to get there',
  challenging: 'Challenging from your current hair',
} as const;

export const STORAGE_KEYS = {
  app: 'eureka.app',
  booking: 'eureka.booking-draft',
  tryOn: 'eureka.tryon',
  /* Read by the inline script in index.html before React mounts, so the app
     never flashes the wrong ground. Keep the two in step. */
  theme: 'eureka.theme',
  language: 'eureka.language',
  provider: 'eureka.provider',
  directory: 'eureka.directory',
} as const;

/** The browser chrome colour per mood, mirroring --bg-primary. */
export const THEME_COLORS = { light: '#efe9e0', dark: '#16130f' } as const;

/** What a business keeps unless it says otherwise. A salon can widen its own
    window, so anything about *one* booking reads `booking.cancellationWindowHours`
    — this is only for policy copy written before a booking exists. */
export const DEFAULT_CANCELLATION_HOURS = 2;

export const CANCELLATION_POLICY = [
  `Cancel free of charge up to ${DEFAULT_CANCELLATION_HOURS} hours before your appointment.`,
  'Inside that window, call the salon instead — the chair is being held for you.',
  'You pay at the salon, so nothing is taken up front. Rescheduling is free whenever there is an open slot.',
];

/* ==========================================================================
   Roles
   ========================================================================== */

/** Names and numbers the mock fixtures are built from — the salon, staff and
    diary data in `src/mockData` read them. These are sample *content* for the
    provider screens, not accounts: signing in goes to the backend, which has
    never heard of them. */
export const FIXTURE_ACCOUNTS: Array<{
  /** Which fixture set this row belongs to, not an authentication role. */
  kind: 'customer' | 'barber' | 'salon_owner' | 'salon_employee' | 'womens_stylist';
  phone: string;
  name: string;
}> = [
  { kind: 'customer', phone: '+8801700000000', name: 'Ahmed Hassan' },
  { kind: 'barber', phone: '+8801711111111', name: 'Rafiqul Karim' },
  { kind: 'salon_owner', phone: '+8801722222222', name: 'Shirin Akter' },
  { kind: 'salon_employee', phone: '+8801733333333', name: 'Hasan Mahmud' },
  { kind: 'womens_stylist', phone: '+8801744444444', name: 'Nadia Sultana' },
];

/* --- Account types -------------------------------------------------------

   Four account types, and only four: a women's barber is a `barber` who
   serves women, a parlour is a `salon_owner` whose place serves women.
   Neither is an account type of its own.

   Three of them can be signed up for. A salon employee cannot: the owner
   creates that account when they add the chair, so there is no employee
   sign-up screen, no route to one, and no way to reach one from the chooser.
   --------------------------------------------------------------------------- */

/** What the chooser offers, in the order it lists them. */
export const REGISTRABLE_ACCOUNT_TYPES: RegistrableAccountType[] = [
  'customer',
  'barber',
  'salon_owner',
];

export const REGISTER_ROUTE_FOR: Record<RegistrableAccountType, string> = {
  customer: ROUTES.registerCustomer,
  barber: ROUTES.registerBarber,
  salon_owner: ROUTES.registerSalonOwner,
};

/** The role each account type becomes. The backend uses the same words, so
    this is a straight correspondence rather than a translation. */
export const ROLE_FOR_ACCOUNT_TYPE: Record<AccountType, UserRole> = {
  customer: 'customer',
  barber: 'barber',
  salon_owner: 'salon_owner',
  salon_employee: 'salon_employee',
};

export const PROVIDER_ROLES: ProviderRole[] = [
  'barber',
  'salon_owner',
  'salon_employee',
];

export const isProviderRole = (role: UserRole | undefined): role is ProviderRole =>
  role !== undefined && role !== 'customer' && role !== 'admin';

/** Where each role lands after signing in. The role comes from the backend
    session, so this table is the whole of role-based redirection. */
/** A professional shows at most this many pictures of their work. Six fills
    the grid on a phone; the server refuses the seventh. */
export const MAX_GALLERY_IMAGES = 6;

export const HOME_ROUTE_FOR: Record<UserRole, string> = {
  customer: ROUTES.home,
  barber: ROUTES.proQueue,
  salon_owner: ROUTES.proSalonQueue,
  salon_employee: ROUTES.proQueue,
  admin: ROUTES.adminHome,
};

export const APPOINTMENT_STAGE_TONES: Record<AppointmentStage, Tone> = {
  pending: 'warning',
  upcoming: 'info',
  in_chair: 'accent',
  completed: 'success',
  no_show: 'warning',
  cancelled: 'neutral',
};

/** Ways money reaches a provider. Cash is still how much of Dhaka pays. */
export const TAKINGS_METHODS: Array<{ id: TakingsMethod; labelKey: string; colorVar: string }> = [
  { id: 'cash', labelKey: 'pro.takingsCash', colorVar: '--sage' },
  { id: 'bkash', labelKey: 'pro.takingsBkash', colorVar: '--pay-bkash' },
  { id: 'nagad', labelKey: 'pro.takingsNagad', colorVar: '--pay-nagad' },
  { id: 'rocket', labelKey: 'pro.takingsRocket', colorVar: '--pay-rocket' },
  { id: 'card', labelKey: 'pro.takingsCard', colorVar: '--pay-card' },
];

export const PAYOUT_METHODS: Array<{ id: PayoutMethod; labelKey: string; colorVar: string }> = [
  { id: 'bkash', labelKey: 'pro.takingsBkash', colorVar: '--pay-bkash' },
  { id: 'nagad', labelKey: 'pro.takingsNagad', colorVar: '--pay-nagad' },
  { id: 'rocket', labelKey: 'pro.takingsRocket', colorVar: '--pay-rocket' },
  { id: 'bank', labelKey: 'pro.payoutBank', colorVar: '--pay-card' },
];

/** The platform's cut of each completed service. */
export const PLATFORM_COMMISSION = 0.1;

/** How long a walk-in stays at the top of the queue before it looks stale. */
export const WALK_IN_GRACE_MINUTES = 15;

export const LOOKBOOK_CATEGORIES = ['Bridal', 'Layers', 'Colouring', 'Hair care'] as const;
