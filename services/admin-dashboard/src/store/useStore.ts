import { create } from 'zustand';
import type {
  AiGenerationCharge,
  AppNotification,
  AuditLogEntry,
  Booking,
  PlatformSettings,
  SmsTemplate,
  SubscriptionTierPlan,
  Toast,
  ToastTone,
  Transaction,
} from '../types';
import {
  defaultSettings,
  mockAiCharges,
  mockBookings,
  mockNotifications,
  mockTemplates,
  mockTransactions,
  SUBSCRIPTION_TIERS,
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
  bookings: Booking[];
  transactions: Transaction[];
  aiCharges: AiGenerationCharge[];
  notifications: AppNotification[];
  templates: SmsTemplate[];
  auditLog: AuditLogEntry[];
  settings: PlatformSettings;
  subscriptionTiers: SubscriptionTierPlan[];

  /* ---- ui ---- */
  toasts: Toast[];
  sidebarCollapsed: boolean;

  /* ---- ui actions ---- */
  pushToast: (tone: ToastTone, title: string, message?: string) => void;
  dismissToast: (id: string) => void;
  toggleSidebarCollapsed: () => void;

  /* ---- audit ---- */
  recordAudit: (input: AuditInput) => void;

  /* ---- payments ---- */
  refundTransaction: (id: string) => void;
  recordManualPayment: (input: { bookingId: string; amount: number; method: Transaction['paymentMethod'] }) => void;

  /* ---- notifications ---- */
  resendNotification: (id: string) => void;
  saveTemplate: (template: SmsTemplate) => void;

  /* ---- settings ---- */
  updateSettings: (patch: Partial<PlatformSettings>) => void;
  updateSubscriptionTier: (id: string, patch: Partial<SubscriptionTierPlan>) => void;
}

export const useStore = create<AdminStore>((set, get) => ({
  bookings: mockBookings,
  transactions: mockTransactions,
  aiCharges: mockAiCharges,
  notifications: mockNotifications,
  templates: mockTemplates,
  auditLog: [],
  settings: defaultSettings,
  subscriptionTiers: SUBSCRIPTION_TIERS,

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

  updateSubscriptionTier: (id, patch) => {
    const before = get().subscriptionTiers.find((tier) => tier.id === id);
    set((state) => ({
      subscriptionTiers: state.subscriptionTiers.map((tier) =>
        tier.id === id ? { ...tier, ...patch } : tier,
      ),
    }));
    get().recordAudit({
      actionType: 'update',
      resourceType: 'SubscriptionTier',
      resourceId: id,
      details: `Updated subscription tier "${before?.name ?? id}"`,
    });
    get().pushToast('success', 'Subscription tier saved', before?.name);
  },
}));
