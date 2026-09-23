/* Domain model for the Eureka Hair App customer PWA.
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
  /** Theirs to rate, finished, and not rated yet. Decided by the server so a
      refresh cannot lose it, which a local flag did. */
  review: boolean;
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
  /** AI try-on credits. Each generation spends one. */
  credits: number;
}

export interface Hairstyle {
  id: string;
  name: string;
  category: string;
  audience: Audience;
  tags: string[];
  occasions: Occasion[];
  faceShapes: FaceShape[];
  hairTypes: HairType[];
  length: HairLength;
  description: string;
  tryOns: number;
  rating: number;
  maintenance: 'low' | 'medium' | 'high';
  /** Which placeholder art tone (0–5) the card draws with. */
  tone: number;
  featured: boolean;
  trending: boolean;
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
  /** This chair's own score — the reviews of work done in it — or null when
      nobody has rated them. Same reason as a business's: `0.0 (0)` under a
      new colleague's name is a verdict nobody has passed. */
  rating: number | null;
  reviewCount: number;
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
  /** The mean of every review of this business, or **null when there are
      none**. Not zero — zero reads as a bad score, and a place nobody has
      reviewed has not been scored badly. */
  rating: number | null;
  reviewCount: number;
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

export interface Review {
  id: string;
  professionalId: string;
  /** The business's name, carried with the review: "My reviews" is reached
      without loading any listing first, so a cache lookup would come up
      empty on a cold start. */
  professionalName?: string;
  /** The appointment this is about. It is also the id every review endpoint
      is keyed on — a visit has at most one review, so the visit names it. */
  bookingId?: string;
  userId: string;
  /** How the reviewer is named in public: given name and an initial. The
      server shortens it; nothing on the client should lengthen it back. */
  userName: string;
  rating: number;
  text: string;
  createdAt: string;
  serviceName?: string;
  staffName?: string;
  /** The business's answer. Empty until they write one, and the customer
      reads it, so it is not a screen-local draft. */
  reply?: string;
  repliedAt?: string | null;
  /** Whose name the reply is signed with — the business's, decided by the
      server rather than inferred from whoever is reading the screen. */
  repliedByName?: string;
  /** Whether the account reading this may answer it. At a salon the owner
      always may and the stylist may only on their own chair and only where
      the salon has not already spoken — a rule no screen can work out, so the
      server answers it and no Reply button is drawn that the API refuses. */
  canReply?: boolean;
}

export interface TimeSlot {
  time: string; // "HH:mm"
  available: boolean;
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
  /** The review of this visit, once there is one. Both sides read it: the
      customer so the screen stops asking, the salon so it can answer. */
  review?: Review;
  hairstyleId?: string;
  /** Whether to text a reminder the day before. Remembered on this device
      only — there is no reminder service behind it yet. */
  smsReminder?: boolean;
}

/* ==========================================================================
   AI try-on. These mirror the FastAPI service in services/ai: `POST /analyze`
   reads the customer's photo, `POST /generate` renders one recommended style
   onto it. Field names are camel-cased at the transport boundary
   (utils/aiService.ts); the wire format is snake_case.
   ========================================================================== */

export type StylingDifficulty = 'easy' | 'moderate' | 'hard';
export type MaintenanceLevel = 'low' | 'medium' | 'high';

/** The eight views of one head the 360 capture walks a customer around. The
    same ids travel to the AI service and back, so one angle is one word from
    the camera to the prompt. `src/utils/angles.ts` owns the ring order. */
export type HeadAngle =
  | 'front'
  | 'front_left'
  | 'left'
  | 'back_left'
  | 'back'
  | 'back_right'
  | 'right'
  | 'front_right';

/** One captured view, held while the 360 flow is in progress. The photo itself
    lives in IndexedDB — only its key travels. */
export interface CapturedAngle {
  angle: HeadAngle;
  photoKey: string;
}

/** One rendered view of a 360 preview: the photo that went in, and the render
    that came back. */
export interface GeneratedView {
  angle: HeadAngle;
  sourceKey: string;
  resultKey: string;
}

/** One hairstyle the AI suggested for this photo. `id` is minted by the AI
    service and travels back with the generation request, so a recommendation
    can be followed from analysis to rendered result. */
export interface HairstyleRecommendation {
  id: string;
  name: string;
  description: string;
  whyItSuits: string;
  /** 0–100, the model's own read of how well the style suits this face. */
  compatibilityScore: number;
  /** 0–100, how directly a barber could cut this from the hair in the photo
      today. A separate question from suiting the face, and the one that
      decides whether the render is honest. Absent on analyses saved before
      the model was asked for it. */
  currentHairFit?: number;
  /** Whether the cut ends up shorter than, or the same as, the hair in the
      photo. The service drops anything that would need it longer — a haircut
      cannot add hair — so 'longer' only survives when every pick failed. */
  lengthChange?: 'shorter' | 'same' | 'longer' | '';
  stylingDifficulty: StylingDifficulty;
  maintenanceLevel: MaintenanceLevel;
  stylingTips: string[];
  suitability: string;
}

/** What the AI could see in the photo. Fed back into the generation prompt and
    shown to the customer so the recommendations are not a black box. Any field
    may be '' when the model could not tell. */
export interface HairProfile {
  faceShape: string;
  faceShapeConfidence: number;
  hairTexture: string;
  hairDensity: string;
  hairLengthObserved: string;
  /** The same read as a bucket, so it can stand in for the self-declared
      profile length when a catalogue style is weighed against real hair. */
  hairLengthCategory?: 'very_short' | 'short' | 'medium' | 'long' | 'extra_long' | '';
  currentHairstyle: string;
  /** What only another angle can show. Empty after a single-photo read — the
      analysis card omits whatever is blank rather than guessing. */
  headShape?: string;
  crownArea?: string;
  backOfHead?: string;
  sides?: string;
  nape?: string;
  thinning?: string;
  scalpVisibility?: string;
  /** Recession, thinning, a high temple — fed back into the render so the
      model keeps the hairline it was shown instead of restoring one. */
  hairline?: string;
  hairHealthScore: number;
  hairColor: string;
  skinTone: string;
  undertone: string;
  hasBeard: boolean;
  beardStyle: string;
}

export interface TryOnAnalysis {
  recommendations: HairstyleRecommendation[];
  profile: HairProfile;
  summary: string;
  model: string;
  /** The stored photo this analysis describes — a new photo needs a new run. */
  photoKey: string;
  /** Which views it was read from. One entry after a single-photo read; up to
      eight after a 360 capture, and the card says which. */
  angles?: HeadAngle[];
  createdAt: string;
}

/** A style the customer can render. Either an AI recommendation or a catalogue
    entry: both reduce to the words the image model needs plus how the card
    should look. */
export interface TryOnStyle {
  id: string;
  name: string;
  description: string;
  origin: 'ai' | 'catalogue';
  feasibility: Feasibility;
  /** The length the style needs, for a catalogue entry. Sent with the render
      so the service can refuse a cut the photo's hair cannot give. An AI pick
      has none — the analysis already vetted it against the photo. */
  length?: HairLength;
  /** Placeholder art tone, for cards that have no photo of their own. */
  tone: number;
  compatibilityScore?: number;
  whyItSuits?: string;
}

/** What `POST /generate` gives back, once decoded. */
export interface TryOnRender {
  blob: Blob;
  model: string;
  latencyMs: number;
}

export interface AIGeneration {
  id: string;
  hairstyleId: string;
  hairstyleName: string;
  createdAt: string;
  feedback?: Feedback;
  feasibility: Feasibility;
  /** IndexedDB keys for the source photo and the rendered result. */
  sourceKey: string;
  resultKey: string;
  /** Where the style came from. Absent on results saved before the AI landed. */
  origin?: TryOnStyle['origin'];
  /** Every rendered view of a 360 preview, in ring order. Absent on an
      ordinary single-photo try-on, which is what makes the two tell apart:
      `sourceKey`/`resultKey` above always point at the front view, so every
      screen that knew about single results still works unchanged. */
  views?: GeneratedView[];
  /** The AI's own reads, kept so the preview can show why it was suggested. */
  compatibilityScore?: number;
  whyItSuits?: string;
  /** Image model that rendered this result, e.g. "gpt-image-1". */
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
  promoNotifications: boolean;
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
