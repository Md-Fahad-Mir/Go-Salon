/* Domain model for the Go Salon customer PWA.
   Frontend-only: every record is seeded from src/mockData, mutated in the
   Zustand stores and persisted to localStorage / IndexedDB. */

export type HairType = 'straight' | 'wavy' | 'curly' | 'coily';
export type HairLength = 'short' | 'medium' | 'long';
export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'oblong';
export type Occasion = 'casual' | 'formal' | 'wedding' | 'party' | 'business' | 'date';
export type Audience = 'men' | 'women' | 'unisex';

/** Which side of the catalogue a customer sees. Optional on `User`: an account
    that has not chosen sees everything. */
export type Gender = 'male' | 'female';
export type BusinessType = 'salon' | 'barber';
export type AcceptanceMode = 'auto' | 'manual';
export type PaymentMethod = 'bkash' | 'nagad' | 'rocket' | 'card';
export type Feasibility = 'easy' | 'moderate' | 'challenging';
export type Feedback = 'like' | 'dislike';
export type ToastTone = 'success' | 'error' | 'warning' | 'info';
export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** `pending` = waiting for a manual-acceptance salon to approve; `confirmed`
    = booked. Both show under the "Upcoming" tab. */
/** Where a booking has got to.

    `pending` only happens at a business that approves by hand; one that
    auto-accepts goes straight to `approved`. `rescheduled` is what the *old*
    row becomes when a new one replaces it. */
export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export type CancelledBy = 'customer' | 'business';

/** What the server says this caller may do next. Worked out there so a screen
    never offers a button the API would refuse. */
export interface BookingActions {
  approve: boolean;
  reject: boolean;
  complete: boolean;
  cancel: boolean;
  reschedule: boolean;
  /** Past the deadline: the customer rings the salon instead. */
  callToCancel: boolean;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Location extends GeoPoint {
  area: string;
  city: string;
  address: string;
}

export interface DayHours {
  open: string; // "10:00"
  close: string; // "20:00"
  closed: boolean;
}

export type OperatingHours = Record<Weekday, DayHours>;

import type { UserRole } from './provider';
import type { WeekSchedule } from './schedule';

export type {
  Schedule,
  ScheduleSource,
  WeekSchedule,
  WorkInterval,
  WorkingDay,
} from './schedule';

export interface User {
  id: string;
  name: string;
  /** Which app this account sees. Comes from the backend session; absent on
      sessions stored before roles existed, which are treated as customers. */
  role?: UserRole;
  /** Who a professional's clients are. This — not a second role — is what
      makes one barber a gents barber and another a women's hairstylist. */
  audience?: Audience;
  /** Whether the phone has been proved with a code. An account that has not
      cannot sign in; the app sends it to the verification screen instead. */
  isPhoneVerified?: boolean;
  /** Drives which salons and hairstyles the customer app shows. Absent means
      no preference, and nothing is filtered out. */
  gender?: Gender;
  phone: string; // E.164, e.g. +8801712345678
  email?: string;
  avatar?: string; // data URL
  hairType?: HairType;
  hairLength?: HairLength;
  location?: Location;
  createdAt: string;
  /** The plan and this month's try-on credits, as the backend counts them.
      Absent until the account has been read from the server. */
  tryOnCredits?: TryOnCredits;
}

/** An account's plan and what it leaves of this month's 360° try-ons
    (`GET /api/tryon/credits/`). One credit is one video; the backend counts
    them off its own log, so this is only ever a copy of its answer. */
export interface TryOnCredits {
  plan: { slug: string; name: string };
  /** What the plan allows each month; null when it is unlimited. */
  total: number | null;
  used: number;
  /** Null when the plan is unlimited. */
  remaining: number | null;
  /** When this month's allowance starts over (ISO). */
  resetsAt: string;
}

/** A subscription plan as the pricing list shows it
    (`GET /api/subscription-tiers/`), in the admin's order. */
/** A plan's monthly price in one currency. */
export interface PlanPrice {
  /** ISO 4217 — "BDT", "USD". */
  currency: string;
  amount: number;
}

export interface SubscriptionPlan {
  slug: string;
  name: string;
  /** Monthly price in the plan's main currency; an amount of 0 is free. */
  price: PlanPrice;
  /** The same plan in other currencies — see `localPrice`. */
  otherPrices: PlanPrice[];
  /** Try-ons a month; null is unlimited. */
  monthlyCredits: number | null;
  features: string[];
  featured: boolean;
}

/** One style from the admin-curated try-on catalogue
    (`GET /api/hairstyles/catalogue/`). Only active styles ever arrive, so
    there is no status to check: if it is here, it can be tried on. */
export interface Hairstyle {
  id: string;
  name: string;
  category: string;
  /** The admin's prompt — what the image model is told this style looks like. */
  prompt: string;
  /** Primary image as a data URL or https link; '' when the admin set none. */
  image: string;
  /** Which placeholder art tone (0–5) the card draws with while there is no
      image to show. Derived from the id, so a style keeps its tone. */
  tone: number;
}

export interface Service {
  id: string;
  professionalId: string;
  name: string;
  category: string;
  duration: number; // minutes
  price: number; // BDT
  description: string;
  includes: string[];
  suitableFor: 'all' | 'men' | 'women';
  hairstyleIds: string[];
  /** The chairs cleared for this service. **Empty means everyone** — the same
      rule the server applies when it narrows chairs, so a menu filtered by
      stylist must read it the same way or it hides the whole price list. */
  staffIds: string[];
  popular?: boolean;
}

export interface StaffMember {
  id: string;
  professionalId: string;
  name: string;
  title: string;
  /** Their own photo, from their profile. Absent when they have not set one
      (and on fixture staff), in which case their initials stand in. */
  avatar?: string;
  specialties: string[];
  experienceYears: number;
  tone: number;
  /** The week this chair works — its own hours if it has set any, otherwise
      the salon's. The server resolves that inheritance before sending it, so
      what arrives is simply the week this person is bookable in. Absent on
      fixture staff, which predate per-chair hours. */
  hours?: WeekSchedule;
  /** Days off, as weekday keys. Fixture-only; a real chair says the same
      thing by closing those days in `hours`. */
  daysOff: Weekday[];
}

/** A place a customer can book: a salon, a barbershop, or a barber working
    for themselves. Both kinds come out of `/api/directory/` in this one shape
    — a customer does not care which table a listing came from — and `kind`
    says which it was. */
export interface Professional {
  /** Kind-prefixed and stable: `salon-3`, `barber-9`. */
  id: string;
  kind: 'salon' | 'barber';
  name: string;
  type: BusinessType;
  /** Who the business is for. A gents salon and a women's parlour are
      different places in Dhaka, and customers expect to be shown one or the
      other; `unisex` appears for everyone. */
  audience: Audience;
  tagline: string;
  bio: string;
  location: Location;
  phone: string;
  email: string;
  /** The logo or portrait, and the wide shot behind the name. Either may be
      blank, and the card falls back to placeholder art. */
  avatar: string;
  coverImage: string;
  gallery: GalleryPhoto[];
  /** The heading a barber files their work under. Blank for a salon. */
  category: string;
  specialties: string[];
  experienceYears: number | null;
  /** The real week, with more than one stretch a day where there is one. */
  hours: WeekSchedule;
  /** Answered by the server against the business's own timezone, so a phone
      set to another country does not close a salon in Dhaka. */
  openNow: boolean;
  acceptance: AcceptanceMode;
  /** Null when nothing is on the menu yet — which is not "free". */
  priceFrom: number | null;
  serviceCount: number;
  staffCount: number;
  verified: boolean;
  acceptingClients: boolean;
  womenOnly: boolean;
  privateBooth: boolean;
  amenities: string[];
  /** Kilometres from wherever the customer is. Undefined when either end has
      no coordinates. */
  distanceKm?: number;
}

export interface GalleryPhoto {
  id: number;
  image: string;
  caption: string;
}

export interface TimeSlot {
  time: string; // "HH:mm"
  available: boolean;
  /** Why it is not on offer — `taken`, `too_soon` or `outside_hours`. */
  reason?: string;
}

export interface BookingService {
  id: string;
  name: string;
  price: number;
  duration: number;
}

export interface Booking {
  id: string;
  /** The directory listing this is with — `salon-3`, `barber-9`. */
  professionalId: string;
  professionalName: string;
  /** The number to ring when a cancellation is past the deadline. */
  businessPhone: string;
  /** The employment id of the chair taking it. Empty for a lone barber. */
  staffId: string;
  staffName: string;
  customerName: string;
  customerPhone: string;
  /** Added at the counter rather than booked ahead. */
  walkIn?: boolean;
  services: BookingService[];
  date: string; // "yyyy-MM-dd"
  time: string; // "HH:mm"
  endTime: string;
  duration: number;
  subtotal: number;
  platformFee: number;
  total: number;
  status: BookingStatus;
  notes?: string;
  rejectReason?: string;
  cancelReason?: string;
  cancelledBy?: CancelledBy;
  /** Hours before the appointment a customer may still cancel online. */
  cancellationWindowHours: number;
  cancelDeadline: string;
  rescheduledFromId?: string;
  rescheduledToId?: string;
  can: BookingActions;
  startsAt: string;
  createdAt: string;
  approvedAt?: string;
  completedAt?: string;
  /** How they settled up, recorded at the counter. Absent is a real answer —
      nobody said — and it is not cash; every screen that shows it says so.
      Same union as `TakingsMethod`, spelled out to keep this module from
      importing the one that imports it. */
  paidWith?: PaymentMethod | 'cash';
  /** Left on top, and the stylist's in full: never part of the business's
      revenue and never commissioned. */
  tip?: number;
  /** Only on the answer to an approve or a reject: whether the customer's
      text actually went out. */
  notification?: { status: string; error: string };
  hairstyleId?: string;
  /** Whether to text a reminder the day before. Remembered on this device
      only — there is no reminder service behind it yet. */
  smsReminder?: boolean;
}

/* ==========================================================================
   AI try-on. A result is a 2–3 second 360° video of the customer turning in
   the chosen admin hairstyle, made through the backend (utils/
   tryOnVideoService.ts). Results from before the video — single edited
   photos and multi-angle rings — are still on some devices and still open,
   which is what `GeneratedView` and `views` below are kept for.
   ========================================================================== */

export type MaintenanceLevel = 'low' | 'medium' | 'high';

/** The eight views of one head an older multi-angle result was rendered
    from. `src/utils/angles.ts` owns the ring order. */
export type HeadAngle =
  | 'front'
  | 'front_left'
  | 'left'
  | 'back_left'
  | 'back'
  | 'back_right'
  | 'right'
  | 'front_right';

/** One rendered view of an older multi-angle result. */
export interface GeneratedView {
  angle: HeadAngle;
  sourceKey: string;
  resultKey: string;
}

export interface AIGeneration {
  id: string;
  hairstyleId: string;
  hairstyleName: string;
  createdAt: string;
  feedback?: Feedback;
  feasibility: Feasibility;
  /** IndexedDB keys for the source photo and the result's still — for a 360°
      video, the edited first frame it turns from, which is what every tile,
      thumbnail and share falls back to. */
  sourceKey: string;
  resultKey: string;
  /** IndexedDB key of the 360° video. Absent on results made before it. */
  videoKey?: string;
  /** Where the style came from. Absent on results saved before the AI landed. */
  origin?: 'ai' | 'catalogue';
  /** Every rendered view of an older multi-angle result, in ring order. */
  views?: GeneratedView[];
  /** The AI's own reads, kept so an older result can show why it was suggested. */
  compatibilityScore?: number;
  whyItSuits?: string;
  /** Model that rendered this result — the video model, for a 360° video. */
  model?: string;
}

export interface AppNotification {
  id: string;
  kind: 'booking' | 'promo' | 'system';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: string;
}

export interface PaymentAccount {
  id: string;
  method: PaymentMethod;
  label: string; // "bKash · 017•• •••890"
  masked: string;
  isDefault: boolean;
}

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
}

export interface UserPreferences {
  smsReminders: boolean;
  bookingUpdates: boolean;
  saveHistory: boolean;
  /** Demo switch: makes the next mock payment fail. */
}

/** In-progress booking, kept while the wizard is open. */
export interface BookingDraft {
  professionalId: string;
  serviceIds: string[];
  staffId: string; // staff id or "any"
  date?: string;
  time?: string;
  notes: string;
  agreedPolicy: boolean;
  smsReminder: boolean;
  /** Set when the wizard is re-entered to move an existing booking. */
  rescheduleOf?: string;
  hairstyleId?: string;
  /** Started from one stylist's own "Book with" button: the stylist is
      already chosen, so the wizard skips the step that asks. */
  staffLocked?: boolean;
}

/* The provider domain lives in its own file but is part of the same model, so
   everything stays importable from `types`. */
export type {
  UserRole,
  ProviderRole,
  AppointmentStage,
  TakingsMethod,
  PayoutMethod,
  VerificationStage,
  ProviderProfile,
  ProviderAppointment,
  StaffRecord,
  ProviderService,
  EarningsDay,
  PayoutAccount,
  Payout,
  ClientHairProfile,
  LookbookItem,
  ExperienceRange,
  GalleryImage,
  ServiceAudience,
  ServiceCategory,
} from './provider';

/* The sign-up side of the model: the four account types the auth screens
   offer, and the shape of what each one submits. */
export type {
  AccountType,
  RegistrableAccountType,
  RegistrationBase,
  CustomerRegistration,
  BarberRegistration,
  SalonOwnerRegistration,
  RegistrationRequest,
  ProfessionalRegistration,
  VerificationRequired,
  AuthSession,
  ResetChannel,
} from './auth';

/* Which salon a request is acting in. Not part of the mock model above: this
   one is server state, and the header derived from it is the whole of how the
   backend tells two businesses apart. */
export type { Tenant } from './tenant';
