/* Domain model for the Eureka admin console. Frontend-only: every record here
   is seeded from src/mockData and mutated in the Zustand store. */

export type UserType = 'customer' | 'barber' | 'salon' | 'employee' | 'admin';
export type SubscriptionTier = 'free' | 'basic' | 'advanced';
export type AccountStatus = 'active' | 'inactive' | 'suspended';
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

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  userType: UserType;
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
  tags: string[];
  description?: string;
  generationCount: number;
  featured: boolean;
  status: EntityStatus;
  successRate: number;
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
  aiImagePrice: number;
  cancellationWindowHours: number;
  otpExpiryMinutes: number;
  otpResendCooldownMinutes: number;
  currency: string;
  currencySymbol: string;
  autoVerifyBusinesses: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  aiModel: string;
  aiMaxConcurrent: number;
  aiTimeoutSeconds: number;
  aiRateLimitPerHour: number;
  notificationTypes: Record<string, boolean>;
  verificationDocs: Record<string, boolean>;
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
