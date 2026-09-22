/* ==========================================================================
   Provider domain — the people who hold the scissors.

   The customer side models someone *booking* a chair. This models the four
   kinds of professional who *own* one, and everything they manage from the
   same mobile app: their queue, their roster, their rates and their money.
   ========================================================================== */

import type {
  Audience,
  BusinessType,
  HairLength,
  HairType,
  Location,
  PaymentMethod,
} from './index';

export type {
  Schedule,
  ScheduleSource,
  WeekSchedule,
  WorkInterval,
  WorkingDay,
} from './schedule';

/** Every account is exactly one of these, and the backend decides which.

    `barber` covers barbers and hairstylists of every kind: a women's
    hairstylist is a barber whose clients are women, which is `User.audience`,
    not a role. `admin` is internal — made from the command line, never
    registered — and has no app of its own here. */
export type UserRole =
  | 'customer'
  | 'barber'
  | 'salon_owner'
  | 'salon_employee'
  | 'admin';

/** Any role that runs a business rather than books one. */
export type ProviderRole = Exclude<UserRole, 'customer' | 'admin'>;

/** An appointment's life on the shop floor.

    `pending`, `upcoming`, `completed` and `cancelled` mirror what the server
    holds. `in_chair` and `no_show` do not: they are the chair-side workflow,
    which has no backend, and live only on this device until the takings do. */
export type AppointmentStage =
  | 'pending'
  | 'upcoming'
  | 'in_chair'
  | 'completed'
  | 'no_show'
  | 'cancelled';

/** How the customer settled up. Cash still matters in Dhaka. */
export type TakingsMethod = PaymentMethod | 'cash';

/** Where a provider's money lands. */
export type PayoutMethod = 'bkash' | 'nagad' | 'rocket' | 'bank';

/** Whether a business has been checked over. Set by a reviewer, not by
    the business — there is no self-service route into the queue. */
export type VerificationStage = 'unverified' | 'pending' | 'verified' | 'rejected';

/* --- The provider's own identity ------------------------------------------ */

export interface ProviderProfile {
  /** The backing row's id: a salon's for an owner, the account's otherwise. */
  id: string;
  /** The `User.id` this profile belongs to. */
  userId: string;
  role: ProviderRole;
  /** Trading name. For a solo barber this is usually their own name. */
  businessName: string;
  /** What they call the job — "Senior Barber", "Colour Specialist". */
  title: string;
  tagline: string;
  bio: string;
  type: BusinessType;
  /** Who their clients are. The whole of the "female barber" distinction. */
  audience: Audience;
  location: Location;
  phone: string;
  email: string;
  avatar: string;
  coverImage: string;
  /** Up to six for a barber, more for a salon's shopfront. */
  gallery: GalleryImage[];
  /** The heading their work sits under, when they have picked one. */
  categoryId: number | null;
  categoryName: string | null;
  experienceYears: number;
  experienceRange: ExperienceRange;
  specialties: string[];
  socials: { instagram: string; facebook: string; tiktok: string };
  /** Off closes the chair to new bookings without deleting anything. */
  acceptingClients: boolean;
  verification: VerificationStage;
  amenities: string[];
  /** Women-only premises. Surfaces as a badge customers can filter on. */
  womenOnly: boolean;
  /** Private booths available for modesty-conscious clients. */
  privateBooth: boolean;
  /** Accept bookings without approving each one by hand. */
  autoAccept: boolean;
  /** Set for an employee: the salon whose chair is theirs. */
  salonId?: number;
  salonName?: string;
  /** Set for an employee: their own employment row, and the share of each
      service that is theirs. */
  employmentId?: number;
  commissionRate?: number;
  joinedAt: string;

  /* Fixture-only, and optional because a real account has none of it. The
     queue and the takings still read `mockData` — see the note at the top of
     `mockData/providers.ts`.

     There is deliberately no listing id and no score here. Reviews are read
     from `/api/reviews/`, which scopes itself to the account asking; handing
     a provider profile the business's listing id would let a screen ask
     `/api/reviews/listing/{id}/` instead, and that endpoint is open to anyone
     signed in — which is how a stylist would end up reading the chair beside
     them. */
  staffId?: string;
  coverTones?: number[];
}

/** A band rather than a number — customers read "5-10 years". */
export type ExperienceRange = 'under_1' | '1_3' | '3_5' | '5_10' | '10_plus';

export interface GalleryImage {
  id: number;
  image: string;
  caption: string;
  sortOrder: number;
}

/* --- The queue ------------------------------------------------------------ */

/** One appointment as the provider sees it: who is coming, for what, and
    where it has got to. The customer side calls this a Booking. */
export interface ProviderAppointment {
  id: string;
  providerId: string;
  /** Which chair is taking it. Absent for a solo barber. */
  staffId?: string;
  staffName?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  /** Repeat customers get a quieter welcome than first-timers. */
  isNewCustomer: boolean;
  services: Array<{ id: string; name: string; price: number; duration: number }>;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm" */
  time: string;
  duration: number;
  /** The services at the salon's own prices. This — not `total` — is the
      business's revenue: the platform's booking fee rides on top of it and is
      never the salon's money. */
  subtotal: number;
  /** What the customer hands over: `subtotal` plus the platform's fee. */
  total: number;
  stage: AppointmentStage;
  /** Set once the chair is occupied, so the screen can count up. */
  startedAt?: string;
  completedAt?: string;
  /** How they paid. Only known once the cut is done. */
  paidWith?: TakingsMethod;
  tip?: number;
  notes?: string;
  /** Booked in person rather than through the app. */
  walkIn?: boolean;
  /** What the server says this account may do with it. */
  can?: {
    approve: boolean;
    reject: boolean;
    complete: boolean;
    cancel: boolean;
  };
  /** The style they showed up wanting, if they came from a try-on. */
  hairstyleId?: string;
  createdAt: string;
}

/* --- Staff (the owner's roster) ------------------------------------------- */

export interface StaffRecord {
  /** The employment row's id — what every staff endpoint is addressed by. */
  id: string;
  /** The person's account id. Distinct from the employment: a barber who
      leaves and is re-hired keeps this and gets a new employment. */
  userId: string;
  name: string;
  phone: string;
  title: string;
  /** Share of each service that is theirs, 0-100. */
  commissionRate: number;
  /** An inactive chair takes no bookings and hides from customers. */
  active: boolean;
  /** False means the chair simply keeps the salon's opening hours. */
  hasOwnSchedule: boolean;
  /** Services this chair has been named on. Empty is not "none": a service
      that names nobody is open to every active chair. */
  serviceIds: string[];
  /** Their own trade record — theirs to edit, the salon's to read. */
  avatar: string;
  bio: string;
  specialties: string[];
  experienceYears: number;
  /** Whether they have proved the number their owner registered for them. */
  phoneVerified: boolean;
  joinedAt: string;

  /* Fixture-only. A chair's score is not here: it comes from `by_staff` on
     `/api/reviews/`, which only an owner is given. */
  staffId?: string;
  tone?: number;
}

/* --- Services the provider sells ------------------------------------------ */

export interface ProviderService {
  id: string;
  name: string;
  /** The heading it sits under. Null when it has none. */
  categoryId: number | null;
  category: string;
  price: number;
  /** Minutes in the chair. */
  duration: number;
  /** Extra minutes reserved before the appointment — mixing colour, prepping
      a bridal set. Blocks the diary without appearing on the bill. */
  bufferBefore: number;
  description: string;
  includes: string[];
  /** Who it suits. A barber sets this per service. */
  audience: ServiceAudience;
  /** Chairs cleared to perform it. Empty means every active one — see
      `availableToAll`, which is the same fact stated positively. */
  staffIds: string[];
  availableToAll: boolean;
  active: boolean;
  popular: boolean;
  /** A multi-step treatment the stylist works through with the client.
      Presentation only — the API does not carry these yet. */
  steps?: string[];
}

/** Who a service is for. `all` is the default: most cuts suit anyone. */
export type ServiceAudience = 'all' | 'male' | 'female';

export interface ServiceCategory {
  id: number;
  name: string;
  /** An icon name from the app's set, or a picture of their own. */
  icon: string;
  description: string;
  /** True for the catalogue everyone starts from, false for their own. */
  shared: boolean;
}

/* --- Money ---------------------------------------------------------------- */

/** One day's takings, split by how the money arrived. */
export interface EarningsDay {
  /** "yyyy-MM-dd" */
  date: string;
  appointments: number;
  /** Keyed by method, in BDT. */
  takings: Record<TakingsMethod, number>;
  tips: number;
  /** What the provider keeps after platform fees and any commission split. */
  net: number;
}

export interface PayoutAccount {
  id: string;
  /** Whose account this is. Without it every provider loads the same list and
      sees somebody else's wallet number. */
  providerId: string;
  method: PayoutMethod;
  /** Wallet number or masked bank account. */
  number: string;
  holderName: string;
  bankName?: string;
  isDefault: boolean;
  verified: boolean;
}

export interface Payout {
  id: string;
  amount: number;
  accountId: string;
  status: 'scheduled' | 'sent' | 'failed';
  /** ISO */
  createdAt: string;
  reference: string;
}

/* --- Women's salon extras -------------------------------------------------- */

/** What the stylist needs to know before the client sits down. */
export interface ClientHairProfile {
  customerId: string;
  customerName: string;
  hairType: HairType;
  hairLength: HairLength;
  /** Free-form notes the stylist keeps between visits. */
  notes?: string;
  /** Colour history, allergies, past treatments — things that change the plan. */
  history: string[];
  /** Reference photos the client brought, as art tones. */
  inspirationTones: number[];
  /** Contact the client only through the app, never by phone. */
  privateContact: boolean;
  lastVisit?: string;
  visitCount: number;
}

export interface LookbookItem {
  id: string;
  providerId: string;
  category: string;
  caption: string;
  tone: number;
  createdAt: string;
  /** Shown on the public profile as well as in the private gallery. */
  published: boolean;
}

