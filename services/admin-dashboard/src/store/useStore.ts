import { create } from 'zustand';
import type {
  AiGenerationCharge,
  AppNotification,
  AuditLogEntry,
  Booking,
  BookingStatus,
  FlaggedContent,
  Hairstyle,
  ModerationStatus,
  PlatformSettings,
  Salon,
  Service,
  SmsTemplate,
  StaffMember,
  Toast,
  ToastTone,
  Transaction,
  User,
  VerificationStatus,
} from '../types';
import {
  defaultSettings,
  mockAiCharges,
  mockAuditLog,
  mockBookings,
  mockFlagged,
  mockHairstyles,
  mockNotifications,
  mockSalons,
  mockServices,
  mockStaff,
  mockTemplates,
  mockTransactions,
  mockUsers,
} from '../mockData';
import { ADMIN_USER } from '../constants';
import { nextId } from '../utils/id';

const SIDEBAR_KEY = 'sidebar-collapsed';

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  } catch {
    return false;
  }
};

interface AuditInput {
  actionType: AuditLogEntry['actionType'];
  resourceType: string;
  resourceId: string;
  details: string;
  before?: string;
  after?: string;
  status?: 'success' | 'failed';
}

export interface AdminStore {
  /* ---- data ---- */
  users: User[];
  salons: Salon[];
  staff: StaffMember[];
  services: Service[];
  hairstyles: Hairstyle[];
  bookings: Booking[];
  transactions: Transaction[];
  aiCharges: AiGenerationCharge[];
  flagged: FlaggedContent[];
  notifications: AppNotification[];
  templates: SmsTemplate[];
  auditLog: AuditLogEntry[];
  settings: PlatformSettings;

  /* ---- ui ---- */
  toasts: Toast[];
  sidebarCollapsed: boolean;

  /* ---- ui actions ---- */
  pushToast: (tone: ToastTone, title: string, message?: string) => void;
  dismissToast: (id: string) => void;
  toggleSidebarCollapsed: () => void;

  /* ---- audit ---- */
  recordAudit: (input: AuditInput) => void;

  /* ---- users ---- */
  updateUser: (id: string, patch: Partial<User>) => void;
  setUserStatus: (id: string, status: User['status']) => void;
  deleteUser: (id: string) => void;

  /* ---- hairstyles ---- */
  addHairstyle: (input: Omit<Hairstyle, 'id' | 'generationCount' | 'successRate' | 'createdAt'>) => void;
  updateHairstyle: (id: string, patch: Partial<Hairstyle>) => void;
  deleteHairstyle: (id: string) => void;

  /* ---- businesses ---- */
  updateSalon: (id: string, patch: Partial<Salon>) => void;
  setVerification: (id: string, status: VerificationStatus) => void;
  upsertStaff: (member: StaffMember) => void;
  removeStaff: (id: string) => void;
  upsertService: (service: Service) => void;
  removeService: (id: string) => void;

  /* ---- bookings ---- */
  setBookingStatus: (id: string, status: BookingStatus, reason?: string) => void;

  /* ---- payments ---- */
  refundTransaction: (id: string) => void;
  recordManualPayment: (input: { bookingId: string; amount: number; method: Transaction['paymentMethod'] }) => void;

  /* ---- moderation ---- */
  resolveFlag: (id: string, status: ModerationStatus, notes: string) => void;

  /* ---- notifications ---- */
  resendNotification: (id: string) => void;
  saveTemplate: (template: SmsTemplate) => void;

  /* ---- settings ---- */
  updateSettings: (patch: Partial<PlatformSettings>) => void;
}

export const useStore = create<AdminStore>((set, get) => ({
  users: mockUsers,
  salons: mockSalons,
  staff: mockStaff,
  services: mockServices,
  hairstyles: mockHairstyles,
  bookings: mockBookings,
  transactions: mockTransactions,
  aiCharges: mockAiCharges,
  flagged: mockFlagged,
  notifications: mockNotifications,
  templates: mockTemplates,
  auditLog: mockAuditLog,
  settings: defaultSettings,

  toasts: [],
  sidebarCollapsed: readCollapsed(),

  pushToast: (tone, title, message) => {
    const id = nextId('toast');
    set((state) => ({ toasts: [...state.toasts, { id, tone, title, message }] }));
    window.setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 4000);
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  toggleSidebarCollapsed: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        /* storage unavailable — collapse still applies for this session */
      }
      return { sidebarCollapsed: next };
    }),

  recordAudit: (input) =>
    set((state) => ({
      auditLog: [
        {
          id: nextId('LOG'),
          timestamp: new Date().toISOString(),
          adminUser: ADMIN_USER.name,
          ipAddress: '103.120.44.18',
          status: input.status ?? 'success',
          ...input,
        },
        ...state.auditLog,
      ],
    })),

  /* ---- users ------------------------------------------------------------ */

  updateUser: (id, patch) => {
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? { ...user, ...patch } : user)),
    }));
    const user = get().users.find((item) => item.id === id);
    get().recordAudit({
      actionType: 'update',
      resourceType: 'User',
      resourceId: id,
      details: `Updated profile for ${user?.name ?? id}`,
    });
    get().pushToast('success', 'User updated', user?.name);
  },

  setUserStatus: (id, status) => {
    const before = get().users.find((user) => user.id === id);
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? { ...user, status } : user)),
    }));
    get().recordAudit({
      actionType: status === 'suspended' ? 'suspend' : 'update',
      resourceType: 'User',
      resourceId: id,
      details: `${status === 'suspended' ? 'Suspended' : 'Set to ' + status} ${before?.name ?? id}`,
      before: before?.status,
      after: status,
    });
    get().pushToast(
      status === 'suspended' ? 'warning' : 'success',
      `Account ${status}`,
      before?.name,
    );
  },

  deleteUser: (id) => {
    const user = get().users.find((item) => item.id === id);
    set((state) => ({ users: state.users.filter((item) => item.id !== id) }));
    get().recordAudit({
      actionType: 'delete',
      resourceType: 'User',
      resourceId: id,
      details: `Deleted account ${user?.name ?? id}`,
    });
    get().pushToast('success', 'User deleted', user?.name);
  },

  /* ---- hairstyles ------------------------------------------------------- */

  addHairstyle: (input) => {
    const hairstyle: Hairstyle = {
      ...input,
      id: nextId('HS'),
      generationCount: 0,
      successRate: 0,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ hairstyles: [hairstyle, ...state.hairstyles] }));
    get().recordAudit({
      actionType: 'create',
      resourceType: 'Hairstyle',
      resourceId: hairstyle.id,
      details: `Added “${hairstyle.name}” to the catalogue`,
    });
    get().pushToast('success', 'Hairstyle added', hairstyle.name);
  },

  updateHairstyle: (id, patch) => {
    const before = get().hairstyles.find((item) => item.id === id);
    set((state) => ({
      hairstyles: state.hairstyles.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    get().recordAudit({
      actionType: 'update',
      resourceType: 'Hairstyle',
      resourceId: id,
      details: `Updated “${before?.name ?? id}”`,
      before: before?.status,
      after: patch.status ?? before?.status,
    });
  },

  deleteHairstyle: (id) => {
    const item = get().hairstyles.find((entry) => entry.id === id);
    set((state) => ({ hairstyles: state.hairstyles.filter((entry) => entry.id !== id) }));
    get().recordAudit({
      actionType: 'delete',
      resourceType: 'Hairstyle',
      resourceId: id,
      details: `Removed “${item?.name ?? id}” from the catalogue`,
    });
    get().pushToast('success', 'Hairstyle deleted', item?.name);
  },

  /* ---- businesses ------------------------------------------------------- */

  updateSalon: (id, patch) => {
    set((state) => ({
      salons: state.salons.map((salon) => (salon.id === id ? { ...salon, ...patch } : salon)),
    }));
    const salon = get().salons.find((item) => item.id === id);
    get().recordAudit({
      actionType: 'update',
      resourceType: 'Business',
      resourceId: id,
      details: `Updated ${salon?.name ?? id}`,
    });
  },

  setVerification: (id, status) => {
    const before = get().salons.find((salon) => salon.id === id);
    set((state) => ({
      salons: state.salons.map((salon) =>
        salon.id === id ? { ...salon, verificationStatus: status } : salon,
      ),
    }));
    get().recordAudit({
      actionType: status === 'verified' ? 'approve' : 'reject',
      resourceType: 'Business',
      resourceId: id,
      details: `${status === 'verified' ? 'Verified' : 'Rejected verification for'} ${before?.name ?? id}`,
      before: before?.verificationStatus,
      after: status,
    });
    get().pushToast(
      status === 'verified' ? 'success' : 'warning',
      status === 'verified' ? 'Business verified' : 'Verification rejected',
      before?.name,
    );
  },

  upsertStaff: (member) => {
    const exists = get().staff.some((item) => item.id === member.id);
    set((state) => ({
      staff: exists
        ? state.staff.map((item) => (item.id === member.id ? member : item))
        : [member, ...state.staff],
    }));
    get().recordAudit({
      actionType: exists ? 'update' : 'create',
      resourceType: 'Staff',
      resourceId: member.id,
      details: `${exists ? 'Updated' : 'Added'} ${member.name}`,
    });
    get().pushToast('success', exists ? 'Staff updated' : 'Staff added', member.name);
  },

  removeStaff: (id) => {
    const member = get().staff.find((item) => item.id === id);
    set((state) => ({ staff: state.staff.filter((item) => item.id !== id) }));
    get().recordAudit({
      actionType: 'delete',
      resourceType: 'Staff',
      resourceId: id,
      details: `Removed ${member?.name ?? id} from the roster`,
    });
    get().pushToast('success', 'Staff removed', member?.name);
  },

  upsertService: (service) => {
    const exists = get().services.some((item) => item.id === service.id);
    set((state) => ({
      services: exists
        ? state.services.map((item) => (item.id === service.id ? service : item))
        : [service, ...state.services],
    }));
    get().recordAudit({
      actionType: exists ? 'update' : 'create',
      resourceType: 'Service',
      resourceId: service.id,
      details: `${exists ? 'Updated' : 'Added'} service “${service.name}”`,
    });
    get().pushToast('success', exists ? 'Service updated' : 'Service added', service.name);
  },

  removeService: (id) => {
    const service = get().services.find((item) => item.id === id);
    set((state) => ({ services: state.services.filter((item) => item.id !== id) }));
    get().recordAudit({
      actionType: 'delete',
      resourceType: 'Service',
      resourceId: id,
      details: `Removed service “${service?.name ?? id}”`,
    });
    get().pushToast('success', 'Service removed', service?.name);
  },

  /* ---- bookings --------------------------------------------------------- */

  setBookingStatus: (id, status, reason) => {
    const before = get().bookings.find((booking) => booking.id === id);
    set((state) => ({
      bookings: state.bookings.map((booking) =>
        booking.id === id ? { ...booking, status, reason: reason ?? booking.reason } : booking,
      ),
    }));
    get().recordAudit({
      actionType: status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'update',
      resourceType: 'Booking',
      resourceId: id,
      details: `${status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Set to ' + status} booking for ${before?.customerName ?? id}`,
      before: before?.status,
      after: status,
    });

    // Approving or rejecting a booking triggers the customer SMS.
    if (status === 'approved' || status === 'rejected') {
      const type = status === 'approved' ? 'Booking approved' : 'Booking declined';
      set((state) => ({
        notifications: [
          {
            id: nextId('NTF'),
            recipientName: before?.customerName ?? 'Customer',
            recipientPhone: before?.customerPhone ?? '',
            type,
            content:
              status === 'approved'
                ? `Eureka: your booking at ${before?.businessName} is confirmed for ${before?.appointmentTime}.`
                : `Eureka: ${before?.businessName} could not take your slot. ${reason ?? ''}`.trim(),
            sentTime: new Date().toISOString(),
            status: 'sent',
            deliveryStatus: 'delivered',
            channel: 'sms',
            attempts: [
              { at: new Date().toISOString(), result: 'delivered', detail: 'Delivered · gateway ack in 0.9s' },
            ],
          },
          ...state.notifications,
        ],
      }));
    }

    get().pushToast(
      status === 'rejected' ? 'warning' : 'success',
      `Booking ${status}`,
      status === 'approved' || status === 'rejected'
        ? 'Customer notified by SMS'
        : before?.customerName,
    );
  },

  /* ---- payments --------------------------------------------------------- */

  refundTransaction: (id) => {
    const transaction = get().transactions.find((item) => item.id === id);
    set((state) => ({
      transactions: state.transactions.map((item) =>
        item.id === id ? { ...item, status: 'refunded' } : item,
      ),
    }));
    get().recordAudit({
      actionType: 'update',
      resourceType: 'Transaction',
      resourceId: id,
      details: `Refunded ${transaction?.totalAmount ?? 0} BDT to ${transaction?.customerName ?? 'customer'}`,
      before: transaction?.status,
      after: 'refunded',
    });
    get().pushToast('success', 'Refund issued', transaction?.customerName);
  },

  recordManualPayment: ({ bookingId, amount, method }) => {
    const booking = get().bookings.find((item) => item.id === bookingId);
    const fee = get().settings.platformFee;
    const transaction: Transaction = {
      id: nextId('TRX'),
      bookingId,
      customerName: booking?.customerName ?? 'Manual entry',
      businessName: booking?.businessName ?? '—',
      amount,
      platformFee: fee,
      totalAmount: amount + fee,
      paymentMethod: method,
      status: 'completed',
      date: new Date().toISOString(),
      reference: `MAN${Math.floor(Math.random() * 900000 + 100000)}`,
    };
    set((state) => ({ transactions: [transaction, ...state.transactions] }));
    get().recordAudit({
      actionType: 'create',
      resourceType: 'Transaction',
      resourceId: transaction.id,
      details: `Recorded a manual ${method} payment against ${bookingId}`,
    });
    get().pushToast('success', 'Payment recorded', transaction.id);
  },

  /* ---- moderation ------------------------------------------------------- */

  resolveFlag: (id, status, notes) => {
    const before = get().flagged.find((item) => item.id === id);
    set((state) => ({
      flagged: state.flagged.map((item) =>
        item.id === id ? { ...item, status, adminNotes: notes } : item,
      ),
    }));
    get().recordAudit({
      actionType: status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'update',
      resourceType: before?.contentType === 'review' ? 'Review' : before?.contentType === 'photo' ? 'Photo' : 'Profile',
      resourceId: id,
      details: notes || `Resolved report ${id} as ${status.replace('_', ' ')}`,
      before: before?.status,
      after: status,
    });
    get().pushToast(
      status === 'rejected' ? 'warning' : 'success',
      status === 'approved'
        ? 'Content kept'
        : status === 'rejected'
          ? 'Content removed'
          : 'More information requested',
      id,
    );
  },

  /* ---- notifications ---------------------------------------------------- */

  resendNotification: (id) => {
    const now = new Date().toISOString();
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'sent',
              deliveryStatus: 'delivered',
              sentTime: now,
              attempts: [
                ...item.attempts,
                { at: now, result: 'delivered', detail: 'Manual resend · delivered' },
              ],
            }
          : item,
      ),
    }));
    get().recordAudit({
      actionType: 'update',
      resourceType: 'Notification',
      resourceId: id,
      details: `Resent notification ${id}`,
    });
    get().pushToast('success', 'Notification resent', id);
  },

  saveTemplate: (template) => {
    set((state) => ({
      templates: state.templates.some((item) => item.id === template.id)
        ? state.templates.map((item) => (item.id === template.id ? template : item))
        : [...state.templates, template],
    }));
    get().recordAudit({
      actionType: 'update',
      resourceType: 'Notification',
      resourceId: template.id,
      details: `Saved SMS template “${template.name}”`,
    });
    get().pushToast('success', 'Template saved', template.name);
  },

  /* ---- settings --------------------------------------------------------- */

  updateSettings: (patch) => {
    const before = get().settings;
    set((state) => ({ settings: { ...state.settings, ...patch } }));
    const [key, value] = Object.entries(patch)[0] ?? ['settings', ''];
    get().recordAudit({
      actionType: 'update',
      resourceType: 'Settings',
      resourceId: key,
      details: `Updated ${key}`,
      before: String(before[key as keyof PlatformSettings] ?? ''),
      after: String(value),
    });
  },
}));

/* Derived selectors kept next to the store so pages stay declarative. */
export const selectOpenFlagCount = (state: AdminStore): number =>
  state.flagged.filter((item) => item.status === 'under_review' || item.status === 'needs_info')
    .length;

export const selectPendingBookings = (state: AdminStore): Booking[] =>
  state.bookings.filter((booking) => booking.status === 'pending');
