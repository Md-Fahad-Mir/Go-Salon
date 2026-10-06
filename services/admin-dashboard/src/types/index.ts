/* Domain model for the Go Salon admin console. Frontend-only: every record here
   is seeded from src/mockData and mutated in the Zustand store. */

/** The role an account holds — what an admin can change it to. */
export type UserType = 'customer' | 'barber' | 'salon' | 'employee' | 'admin';
/** How the Users page files an account: its role, with salon owners and
    employees split into salon and parlour by whether the place serves women.
    Derived by the backend, never edited directly. */
export type AccountType =
  | 'customer'
  | 'barber'
  | 'salon_owner'
  | 'salon_employee'
  | 'parlour_owner'
  | 'parlour_employee'
  | 'admin';
/** A subscription tier's slug — what an account's plan points at. Tiers are
    curated in Settings, so this is any slug the backend knows, not a fixed
    set ('free', 'basic' and 'advanced' are only the seeded three). */
export type SubscriptionTier = string;
export type AccountStatus = 'active' | 'inactive' | 'suspended';
export type Audience = 'men' | 'women' | 'unisex';
export type EntityStatus = 'active' | 'inactive';
export type VerificationStatus = 'verified' | 'pending' | 'rejected';
export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';
export type AcceptanceMode = 'auto' | 'manual';
export type PaymentMethod = 'bkash' | 'nagad' | 'rocket' | 'card';
export type TransactionStatus = 'completed' | 'failed' | 'pending' | 'refunded';
export type ModerationStatus = 'under_review' | 'approved' | 'rejected' | 'needs_info';
export type ContentType = 'review' | 'photo' | 'profile';
export type NotificationStatus = 'scheduled' | 'sent' | 'failed' | 'bounced';
export type DeliveryStatus = 'delivered' | 'failed' | 'pending';
export type TargetAudience = 'male' | 'female' | 'all';
export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type OperatingHours = Record<Weekday, DayHours>;

export interface GeoLocation {
  city: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
}

export interface UserBusiness {
  id: string;
  name: string;
  businessType: 'salon' | 'barber';
  audience: Audience;
  location: GeoLocation;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  userType: UserType;
  accountType: AccountType;
  /** Owners only: every salon or parlour they run. */
  salons?: UserBusiness[];
  /** Employees only: where they currently work, if anywhere. */
  employment?: { title: string; salon: UserBusiness };
  subscriptionTier: SubscriptionTier;
  registrationDate: string;
  avatar?: string;
  status: AccountStatus;
  totalBookings: number;
  averageRating?: number;
  location?: GeoLocation;
  hairType?: string;
  preferredLength?: string;
  phoneVerified: boolean;
  generationsUsed: number;
}

export interface StaffMember {
  id: string;
  salonId: string;
  name: string;
  phone: string;
  roleTitle: string;
  specialties: string[];
  experienceYears: string;
  customHours: boolean;
  status: EntityStatus;
  rating: number;
  bio?: string;
}

export interface Service {
  id: string;
  businessId: string;
  name: string;
  category: string;
  price: number;
  duration: number;
  targetAudience: TargetAudience;
  eligibility: 'all' | 'specific';
  eligibleStaffIds: string[];
  description?: string;
  status: EntityStatus;
}

export interface Salon {
  id: string;
  name: string;
  businessType: 'salon' | 'barber';
  ownerName: string;
  phone: string;
  email?: string;
  location: GeoLocation;
  bio?: string;
  verificationStatus: VerificationStatus;
  activeStaffCount: number;
  totalServices: number;
  rating: number;
  reviewCount: number;
  status: EntityStatus;
  operatingHours: OperatingHours;
  joinedDate: string;
  acceptanceMode: AcceptanceMode;
  monthlyRevenue: number;
}

export interface Booking {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  businessId: string;
  businessName: string;
  staffName?: string;
  serviceName: string;
  serviceDuration: number;
  appointmentDate: string;
  appointmentTime: string;
  createdAt: string;
  status: BookingStatus;
  acceptanceMode: AcceptanceMode;
  amount: number;
  platformFee: number;
  totalAmount: number;
  notes?: string;
  reason?: string;
}

export interface Transaction {
  id: string;
  bookingId: string;
  customerName: string;
  businessName: string;
  amount: number;
  platformFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  date: string;
  reference: string;
}

export interface AiGenerationCharge {
  id: string;
  userId: string;
  userName: string;
  hairstyleName: string;
  images: number;
  charge: number;
  cost: number;
  outcome: 'success' | 'failed';
  latencySeconds: number;
  date: string;
}

export interface Hairstyle {
  id: string;
  name: string;
  category: string;
  image: string;
  description?: string;
  generationCount: number;
  status: EntityStatus;
  createdAt: string;
}

export interface FlaggedReview {
  kind: 'review';
  rating: number;
  text: string;
  authorName: string;
  subjectName: string;
}

export interface FlaggedPhoto {
  kind: 'photo';
  context: 'profile' | 'portfolio' | 'consultation';
  uploaderName: string;
  caption: string;
}

export interface FlaggedProfile {
  kind: 'profile';
  profileName: string;
  profileType: UserType;
  summary: string;
}

export type FlaggedPayload = FlaggedReview | FlaggedPhoto | FlaggedProfile;

export interface FlaggedContent {
  id: string;
  contentType: ContentType;
  reporterId: string;
  reporterName: string;
  reason: string;
  dateReported: string;
  status: ModerationStatus;
  adminNotes?: string;
  content: FlaggedPayload;
}

export interface AppNotification {
  id: string;
  recipientName: string;
  recipientPhone: string;
  type: string;
  content: string;
  scheduledTime?: string;
  sentTime?: string;
  status: NotificationStatus;
  deliveryStatus: DeliveryStatus;
  attempts: DeliveryAttempt[];
  channel: 'sms' | 'push';
}

export interface DeliveryAttempt {
  at: string;
  result: 'delivered' | 'failed' | 'queued';
  detail: string;
}

export interface SmsTemplate {
  id: string;
  name: string;
  type: string;
  body: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  adminUser: string;
  actionType: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'suspend' | 'login';
  resourceType: string;
  resourceId: string;
  details: string;
  status: 'success' | 'failed';
  ipAddress: string;
  before?: string;
  after?: string;
}

export interface PlatformSettings {
  platformFee: number;
  smsEnabled: boolean;
  emailEnabled: boolean;
}

/** A plan's monthly price in one currency. */
export interface PlanPrice {
  /** ISO 4217 — "BDT", "USD". */
  currency: string;
  amount: number;
}

export interface SubscriptionTierPlan {
  id: string;
  /** Minted from the name on creation and fixed after — accounts point at it. */
  slug: SubscriptionTier;
  name: string;
  /** The main currency, ISO 4217: what `price` is in, and what a customer
      sees when the plan has no price in theirs. */
  currency: string;
  /** Monthly price in `currency`; 0 is a free plan, free in every currency. */
  price: number;
  /** The same plan in other currencies, in the order they were added. */
  otherPrices: PlanPrice[];
  /** 360° try-on videos the plan allows each month — one credit each. Null
      is unlimited. */
  monthlyCredits: number | null;
  featured: boolean;
  /** The plan new accounts start on. Exactly one tier has it. */
  isDefault: boolean;
  features: string[];
  subscriberCount: number;
}

/* --- UI-level shapes ------------------------------------------------------ */

export type TimeRange = '30d' | '7d' | 'today';

export interface KpiDatum {
  id: string;
  label: string;
  value: string;
  footnote: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface DailyPoint {
  date: string;
  generations: number;
  highlight: boolean;
}

export interface RankedDatum {
  /** A stable key when names can repeat. */
  id?: string;
  name: string;
  value: number;
}

export interface RevenueSlice {
  method: PaymentMethod;
  label: string;
  amount: number;
  color: string;
}

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
}
