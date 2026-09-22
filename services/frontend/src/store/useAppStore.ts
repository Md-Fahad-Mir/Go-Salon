import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AIGeneration,
  AppNotification,
  Booking,
  Feedback,
  PaymentAccount,
  RegistrableAccountType,
  Toast,
  ToastTone,
  User,
  UserPreferences,
} from '../types';
import { STARTING_CREDITS, STORAGE_KEYS } from '../constants';
import { nextId } from '../utils/id';

/* --------------------------------------------------------------------------
   Session and per-account data.

   Who is signed in comes from the backend — this store holds the tokens it
   issued and the account it described, and nothing else decides either.

   The rest (bookings, favourites, try-on history) is still the app's local
   mock data. It is parked in `archive` under the account's id on sign-out and
   restored when that account signs back in, so switching accounts on one
   device does not mix two people's screens together.
   -------------------------------------------------------------------------- */

export interface AccountData {
  user: User;
  bookings: Booking[];
  favorites: string[];
  generations: AIGeneration[];
  notifications: AppNotification[];
  paymentAccounts: PaymentAccount[];
  preferences: UserPreferences;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  smsReminders: true,
  promoNotifications: true,
  bookingUpdates: true,
  saveHistory: true,
};

const welcomeNotification = (): AppNotification => ({
  id: nextId('NTF'),
  kind: 'system',
  title: 'Welcome to Eureka',
  body: `Your first ${STARTING_CREDITS} try-ons are on us. See the cut before the cut.`,
  createdAt: new Date().toISOString(),
  read: false,
  link: '/ai-tryon',
});

/** A brand-new account starts empty, with one thing in its inbox. */
const seedFor = (): Omit<AccountData, 'user'> => ({
  bookings: [],
  favorites: [],
  generations: [],
  notifications: [welcomeNotification()],
  paymentAccounts: [],
  preferences: { ...DEFAULT_PREFERENCES },
});

/** Whether the session has been worked out yet. The app cannot know if a
    stored token is still good until it has asked, and showing a sign-in
    screen to someone who is signed in is worse than showing a spinner. */
export type AuthStatus = 'restoring' | 'ready';

/** A sign-up waiting on its code. */
export interface PendingVerification {
  phone: string;
  purpose: 'registration';
  /** Seconds the backend said to wait before another code may be asked for. */
  resendIn: number;
}

export interface AppStore extends Omit<AccountData, 'user'> {
  /* ---- session ---- */
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  /** The sign-up whose code has not been entered yet. */
  pendingVerification: PendingVerification | null;
  /** Which account the person is part-way through creating. Chosen on
      `/auth/register`, spent by the registration screen, cleared the moment
      an account exists. Never an employee: that account is the owner's to
      create, so there is nothing here for one to be part-way through. */
  pendingAccountType: RegistrableAccountType | null;
  archive: Record<string, AccountData>;
  toasts: Toast[];
  hasSeenWelcome: boolean;

  /* ---- auth ---- */
  /** Takes a session exactly as the backend issued it. */
  setSession: (session: { user: User; access: string; refresh: string }) => void;
  /** After a refresh: new tokens, same account. */
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  setAuthStatus: (status: AuthStatus) => void;
  /** Drops the session locally. The backend is told separately, by logout. */
  clearSession: () => void;
  setPendingVerification: (pending: PendingVerification | null) => void;
  setAccountType: (type: RegistrableAccountType | null) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
  setHasSeenWelcome: (seen: boolean) => void;

  /* ---- bookings ---- */
  /** Replaces the cache with what the server just said. */
  setBookings: (bookings: Booking[]) => void;
  /** Files one booking into the cache, adding or replacing. */
  rememberBooking: (booking: Booking) => void;
  addBooking: (booking: Booking) => void;
  updateBooking: (id: string, patch: Partial<Booking>) => void;
  getBooking: (id: string) => Booking | undefined;

  /* ---- favourites ---- */
  toggleFavorite: (professionalId: string) => boolean;
  isFavorite: (professionalId: string) => boolean;

  /* ---- try-on ---- */
  addGeneration: (generation: AIGeneration) => void;
  removeGeneration: (id: string) => void;
  clearGenerations: () => void;
  setGenerationFeedback: (id: string, feedback: Feedback | undefined) => void;
  spendCredit: () => boolean;
  addCredits: (amount: number) => void;

  /* ---- notifications ---- */
  pushNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadCount: () => number;

  /* ---- payments ---- */
  addPaymentAccount: (account: Omit<PaymentAccount, 'id'>) => void;
  setDefaultPaymentAccount: (id: string) => void;
  removePaymentAccount: (id: string) => void;

  /* ---- preferences ---- */
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;

  /* ---- toasts ---- */
  toast: (tone: ToastTone, title: string, message?: string) => void;
  dismissToast: (id: string) => void;
}

const EMPTY_ACCOUNT: Omit<AccountData, 'user'> = {
  bookings: [],
  favorites: [],
  generations: [],
  notifications: [],
  paymentAccounts: [],
  preferences: { ...DEFAULT_PREFERENCES },
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_ACCOUNT,
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      authStatus: 'restoring',
      pendingVerification: null,
      pendingAccountType: null,
      archive: {},
      toasts: [],
      hasSeenWelcome: false,

      /* ---- auth ---- */
      setSession: ({ user, access, refresh }) => {
        // This device may already hold this account's bookings and try-ons
        // from a previous sign-in; a different account gets a clean start.
        const archived = get().archive[user.id];
        const data = archived ?? seedFor();
        set({
          user,
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: true,
          authStatus: 'ready',
          pendingVerification: null,
          pendingAccountType: null,
          hasSeenWelcome: true,
          bookings: data.bookings,
          favorites: data.favorites,
          generations: data.generations,
          notifications: data.notifications,
          paymentAccounts: data.paymentAccounts,
          preferences: data.preferences,
        });
      },

      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),

      setUser: (user) => set({ user, isAuthenticated: true, authStatus: 'ready' }),

      setAuthStatus: (status) => set({ authStatus: status }),

      clearSession: () => {
        const state = get();
        const archive = { ...state.archive };
        if (state.user) {
          archive[state.user.id] = {
            user: state.user,
            bookings: state.bookings,
            favorites: state.favorites,
            generations: state.generations,
            notifications: state.notifications,
            paymentAccounts: state.paymentAccounts,
            preferences: state.preferences,
          };
        }
        set({
          ...EMPTY_ACCOUNT,
          preferences: { ...DEFAULT_PREFERENCES },
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          authStatus: 'ready',
          pendingVerification: null,
          pendingAccountType: null,
          archive,
        });
      },

      setPendingVerification: (pending) => set({ pendingVerification: pending }),

      setAccountType: (type) => set({ pendingAccountType: type }),

      updateUser: (patch) => {
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, ...patch } });
      },

      /** Signing out locally. `useAuth().logout` calls this after telling the
          backend to blacklist the refresh token. */
      logout: () => get().clearSession(),

      setHasSeenWelcome: (seen) => set({ hasSeenWelcome: seen }),

      /* ---- bookings ---- */
      setBookings: (bookings) => set({ bookings }),

      /* Bookings live on the server; this is the copy this device is showing.
         A write goes to the API first and the answer lands here, so what is on
         screen is always what the server last said rather than a guess. */
      rememberBooking: (booking) => {
        const bookings = get().bookings;
        const known = bookings.some((entry) => entry.id === booking.id);
        set({
          bookings: known
            ? bookings.map((entry) => (entry.id === booking.id ? booking : entry))
            : [booking, ...bookings],
        });
      },

      addBooking: (booking) => get().rememberBooking(booking),

      updateBooking: (id, patch) =>
        set({ bookings: get().bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) }),

      getBooking: (id) => get().bookings.find((b) => b.id === id),

      /* ---- favourites ---- */
      toggleFavorite: (professionalId) => {
        const favorites = get().favorites;
        const next = favorites.includes(professionalId)
          ? favorites.filter((f) => f !== professionalId)
          : [professionalId, ...favorites];
        set({ favorites: next });
        return next.includes(professionalId);
      },

      isFavorite: (professionalId) => get().favorites.includes(professionalId),

      /* ---- try-on ---- */
      addGeneration: (generation) => set({ generations: [generation, ...get().generations] }),
      removeGeneration: (id) => set({ generations: get().generations.filter((g) => g.id !== id) }),
      clearGenerations: () => set({ generations: [] }),
      setGenerationFeedback: (id, feedback) =>
        set({ generations: get().generations.map((g) => (g.id === id ? { ...g, feedback } : g)) }),

      spendCredit: () => {
        const user = get().user;
        if (!user || user.credits <= 0) return false;
        set({ user: { ...user, credits: user.credits - 1 } });
        return true;
      },

      addCredits: (amount) => {
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, credits: user.credits + amount } });
      },

      /* ---- notifications ---- */
      pushNotification: (notification) =>
        set({
          notifications: [
            { ...notification, id: nextId('NTF'), createdAt: new Date().toISOString(), read: false },
            ...get().notifications,
          ],
        }),
      markNotificationRead: (id) =>
        set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),
      markAllNotificationsRead: () =>
        set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
      unreadCount: () => get().notifications.filter((n) => !n.read).length,

      /* ---- payments ---- */
      addPaymentAccount: (account) => {
        const existing = get().paymentAccounts;
        const next: PaymentAccount = { ...account, id: nextId('PAY') };
        const cleared = account.isDefault ? existing.map((p) => ({ ...p, isDefault: false })) : existing;
        set({ paymentAccounts: [...cleared, next] });
      },
      setDefaultPaymentAccount: (id) =>
        set({ paymentAccounts: get().paymentAccounts.map((p) => ({ ...p, isDefault: p.id === id })) }),
      removePaymentAccount: (id) =>
        set({ paymentAccounts: get().paymentAccounts.filter((p) => p.id !== id) }),

      /* ---- preferences ---- */
      setPreference: (key, value) => set({ preferences: { ...get().preferences, [key]: value } }),

      /* ---- toasts ---- */
      toast: (tone, title, message) => {
        const id = nextId('T');
        set({ toasts: [...get().toasts, { id, tone, title, message }] });
        setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 3800);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    }),
    {
      name: STORAGE_KEYS.app,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        pendingVerification: state.pendingVerification,
        pendingAccountType: state.pendingAccountType,
        archive: state.archive,
        hasSeenWelcome: state.hasSeenWelcome,
        bookings: state.bookings,
        favorites: state.favorites,
        generations: state.generations,
        notifications: state.notifications,
        paymentAccounts: state.paymentAccounts,
        preferences: state.preferences,
      }),
    },
  ),
);

/** Fire a toast from anywhere (api layer, hooks) without a hook. */
export const toast = (tone: ToastTone, title: string, message?: string) =>
  useAppStore.getState().toast(tone, title, message);
