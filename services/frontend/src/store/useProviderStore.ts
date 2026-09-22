import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../constants';
import {
  earningsFor,
  lookbookFor,
  payoutAccountsFor,
} from '../mockData';
import type {
  AppointmentStage,
  Booking,
  EarningsDay,
  LookbookItem,
  PayoutAccount,
  ProviderAppointment,
  ProviderProfile,
  ProviderService,
  Schedule,
  ServiceCategory,
  StaffRecord,
  TakingsMethod,
} from '../types';
import { bookingService, toProviderAppointment } from '../utils/bookingService';
import { catalogService, type ServicePayload } from '../utils/catalogService';
import { profileService, toProviderProfile, toUser, type ProfilePatch } from '../utils/profileService';
import { useAppStore } from './useAppStore';
import { scheduleService } from '../utils/scheduleService';
import { staffService, type NewStaffPayload, type StaffPatch } from '../utils/staffService';
import { nextId } from '../utils/id';

/* The provider's working state.

   Four parts of it are real — the profile, the price list, the roster and the
   working hours all come from the backend and every change here goes back
   there. The rest (the queue, the takings, the lookbook) has no backend yet
   and is still seeded from `mockData`; a real account matches none of those
   seeds, so those screens are honestly empty rather than lying with somebody
   else's numbers.

   It is kept apart from useAppStore because a customer session never touches
   any of it, and because signing out has to drop it wholesale. */

/** Where the profile, services, staff and hours are up to. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface ProviderState {
  profile: ProviderProfile | null;
  services: ProviderService[];
  categories: ServiceCategory[];
  staff: StaffRecord[];
  schedule: Schedule | null;
  /** Covers the four API-backed slices above, which load together. */
  status: LoadState;
  error: string | null;

  appointments: ProviderAppointment[];
  earnings: EarningsDay[];
  payoutAccounts: PayoutAccount[];
  lookbook: LookbookItem[];

  /** Fetches everything this account owns. Called on sign-in and on reload. */
  load: () => Promise<ProviderProfile | null>;
  /** Re-reads without clearing what is on screen — used after a write. */
  refresh: () => Promise<void>;
  clear: () => void;

  /* queue */
  /** Re-reads the diary from the server. The same endpoint answers an owner
      salon-wide and an employee for their own chair — the scoping is the
      server's, so this makes no distinction. */
  loadAppointments: () => Promise<void>;
  /** Folds one live booking event into the diary. The socket carries the
      whole row, so this replaces rather than patches. */
  applyBookingEvent: (booking: Booking) => void;
  /** Bookings that arrived over the socket since this session started.
      The day screens are scoped to one day; a booking for next Saturday has
      nowhere to land on them, and a toast that has faded is not a record. */
  liveArrivals: string[];
  dismissArrivals: () => void;
  /** Says yes to a booking that was waiting, and texts the customer. */
  approveAppointment: (id: string) => Promise<{ notified: boolean; error?: string }>;
  /** Turns one down with a reason, which the customer is texted verbatim. */
  rejectAppointment: (id: string, reason: string) => Promise<{ notified: boolean; error?: string }>;
  setStage: (appointmentId: string, stage: AppointmentStage) => void;
  startAppointment: (appointmentId: string) => void;
  completeAppointment: (appointmentId: string, paidWith: TakingsMethod, tip?: number) => void;
  addWalkIn: (input: {
    customerName: string;
    customerPhone?: string;
    serviceIds: string[];
    staffId?: string;
    notes?: string;
  }) => Promise<ProviderAppointment | null>;
  reassign: (appointmentId: string, staffId: string) => void;

  /* profile */
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  setAutoAccept: (on: boolean) => Promise<void>;
  addGalleryImage: (image: string, caption?: string) => Promise<void>;
  removeGalleryImage: (id: number) => Promise<void>;

  /* services */
  addService: (payload: ServicePayload) => Promise<ProviderService>;
  updateService: (id: string, payload: ServicePayload) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  addCategory: (name: string) => Promise<ServiceCategory>;

  /* staff */
  addStaff: (payload: NewStaffPayload) => Promise<StaffRecord>;
  updateStaff: (id: string, patch: StaffPatch) => Promise<void>;
  removeStaff: (id: string) => Promise<void>;

  /* working hours */
  saveSchedule: (days: Schedule['days']) => Promise<void>;
  resetSchedule: () => Promise<void>;

  /* money */
  /** `providerId` is stamped by the store, so callers never pass it. */
  addPayoutAccount: (account: Omit<PayoutAccount, 'id' | 'providerId'>) => void;
  setDefaultPayoutAccount: (id: string) => void;
  removePayoutAccount: (id: string) => void;

  /* lookbook */
  addLookbookItem: (item: Omit<LookbookItem, 'id' | 'providerId' | 'createdAt'>) => void;
  updateLookbookItem: (id: string, patch: Partial<LookbookItem>) => void;
  removeLookbookItem: (id: string) => void;
}

/* What a server row does not carry, and the device must not lose.

   `startedAt` is a fact about this device — the server has no notion of who is
   mid-cut. `paidWith` and `tip` are real columns now and `POST /complete/`
   writes them, but the appointment serializer does not return them yet, so a
   refresh or a socket echo would blank what the counter recorded seconds
   earlier. The server's answer wins the moment it sends one; until then the
   device keeps its own. Nothing here invents a value: absent stays absent. */
const keepLocal = (
  row: ProviderAppointment,
  known: ProviderAppointment | undefined,
): ProviderAppointment =>
  known
    ? {
        ...row,
        startedAt: row.startedAt ?? known.startedAt,
        paidWith: row.paidWith ?? known.paidWith,
        tip: row.tip ?? known.tip,
      }
    : row;

const EMPTY = {
  profile: null,
  services: [],
  categories: [],
  staff: [],
  schedule: null,
  status: 'idle' as LoadState,
  error: null,
  appointments: [],
  liveArrivals: [],
  earnings: [],
  payoutAccounts: [],
  lookbook: [],
};

const todayKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      /* --- loading --------------------------------------------------- */

      load: async () => {
        set({ status: 'loading', error: null });
        try {
          const payload = await profileService.get();
          const profile = toProviderProfile(payload);
          if (!profile) {
            // Signed in, but not as a professional: nothing here is theirs.
            set({ ...EMPTY, status: 'ready' });
            return null;
          }

          // One round trip each, in parallel: the screens need all four and
          // waiting for them in sequence is three avoidable round trips.
          const [services, categories, staff, schedule] = await Promise.all([
            catalogService.listServices(),
            catalogService.listCategories(),
            profile.role === 'salon_owner' ? staffService.list() : Promise.resolve([]),
            scheduleService.mine(),
          ]);

          set({
            profile,
            services,
            categories,
            staff,
            schedule,
            status: 'ready',
            error: null,
            // Still fixtures, and keyed to fixture ids: a real account gets
            // nothing back, which is the honest answer until bookings and
            // takings have a backend.
            appointments: [],
            liveArrivals: [],
            earnings: earningsFor(profile.id),
            payoutAccounts: payoutAccountsFor(profile.id),
            lookbook: lookbookFor(profile.id),
          });
          // The diary is its own request: it is the one thing that changes
          // while somebody is looking at the screen.
          void get().loadAppointments();
          return profile;
        } catch (error) {
          set({
            status: 'error',
            error: error instanceof Error ? error.message : 'Could not load your business.',
          });
          return null;
        }
      },

      refresh: async () => {
        const { profile } = get();
        if (!profile) {
          await get().load();
          return;
        }
        try {
          const [payload, services, staff, schedule] = await Promise.all([
            profileService.get(),
            catalogService.listServices(),
            profile.role === 'salon_owner' ? staffService.list() : Promise.resolve([]),
            scheduleService.mine(),
          ]);
          set({
            profile: toProviderProfile(payload) ?? profile,
            services,
            staff,
            schedule,
            status: 'ready',
            error: null,
          });
        } catch {
          // A failed refresh leaves what is already on screen alone: the last
          // known-good list beats an empty one.
        }
      },

      clear: () => set({ ...EMPTY }),

      /* ---- queue ---- */

      loadAppointments: async () => {
        try {
          const { bookings } = await bookingService.list();
          const rows = bookings
            .map(toProviderAppointment)
            .filter((row): row is NonNullable<typeof row> => row !== null);
          set((state) => {
            const local = new Map(state.appointments.map((row) => [row.id, row]));
            return {
              appointments: rows.map((row) => {
                const held = local.get(row.id);
                const merged = keepLocal(row, held);
                // A chair that is mid-cut is a fact about this device, not the
                // server, so a refresh must not send somebody back to
                // "upcoming".
                return held &&
                  (held.stage === 'in_chair' || held.stage === 'no_show') &&
                  row.stage === 'upcoming'
                  ? { ...merged, stage: held.stage, startedAt: held.startedAt }
                  : merged;
              }),
            };
          });
        } catch {
          // Keep what is on screen: a stale diary beats an empty one.
        }
      },

      applyBookingEvent: (booking) => {
        const row = toProviderAppointment(booking);
        set((state) => {
          if (!row) {
            // A booking that moved is history; the row that replaced it
            // arrives as its own event.
            return { appointments: state.appointments.filter((entry) => entry.id !== booking.id) };
          }
          const known = state.appointments.find((entry) => entry.id === row.id);
          // Whoever is in the chair right now is a fact about this device, not
          // the server's, so a live update must not send them back to
          // "upcoming" — the same rule `loadAppointments` follows.
          const held =
            known && (known.stage === 'in_chair' || known.stage === 'no_show') && row.stage === 'upcoming'
              ? { stage: known.stage, startedAt: known.startedAt }
              : null;
          // The same echo would otherwise wipe how the counter said it was
          // paid, because the serializer does not send that back yet.
          const carried = keepLocal(row, known);
          const merged = held ? { ...carried, ...held } : carried;
          return {
            appointments: known
              ? state.appointments.map((entry) => (entry.id === row.id ? merged : entry))
              : [...state.appointments, merged],
            // Only a booking that was not already here counts as an arrival;
            // an approval or a cancellation is news about one already known.
            liveArrivals:
              known || state.liveArrivals.includes(row.id)
                ? state.liveArrivals
                : [...state.liveArrivals, row.id],
          };
        });
      },

      dismissArrivals: () => set({ liveArrivals: [] }),

      approveAppointment: async (id) => {
        const booking = await bookingService.approve(id);
        const row = toProviderAppointment(booking);
        if (row) {
          set((state) => ({
            appointments: state.appointments.map((entry) => (entry.id === id ? row : entry)),
          }));
        }
        return {
          notified: booking.notification?.status === 'sent',
          error: booking.notification?.error || undefined,
        };
      },

      rejectAppointment: async (id, reason) => {
        const booking = await bookingService.reject(id, reason);
        const row = toProviderAppointment(booking);
        set((state) => ({
          appointments: row
            ? state.appointments.map((entry) => (entry.id === id ? row : entry))
            : state.appointments.filter((entry) => entry.id !== id),
        }));
        return {
          notified: booking.notification?.status === 'sent',
          error: booking.notification?.error || undefined,
        };
      },

      setStage: (appointmentId, stage) =>
        set((state) => ({
          appointments: state.appointments.map((a) => (a.id === appointmentId ? { ...a, stage } : a)),
        })),

      startAppointment: (appointmentId) =>
        set((state) => ({
          appointments: state.appointments.map((a) =>
            a.id === appointmentId
              ? { ...a, stage: 'in_chair' as AppointmentStage, startedAt: new Date().toISOString() }
              : // Only one client can be in the chair at a time, so anyone else
                // sitting there is pushed back to upcoming.
                a.stage === 'in_chair' && a.staffId === state.appointments.find((x) => x.id === appointmentId)?.staffId
                ? { ...a, stage: 'upcoming' as AppointmentStage }
                : a,
          ),
        })),

      completeAppointment: (appointmentId, paidWith, tip) => {
        /* How they paid and what they tipped are real columns now, so they go
           to the server with the completion rather than living on one device.
           The local write below stays: whoever is settling up has the next
           client waiting and should not watch a spinner, and the queue summary
           and EarningsPage read it straight away. When the server answers, its
           row replaces this one — and `keepLocal` holds the payment until the
           serializer actually returns it. */
        void bookingService
          .complete(appointmentId, { paidWith, tip })
          .then((booking) => {
            const row = toProviderAppointment(booking);
            if (!row) return;
            set((state) => ({
              appointments: state.appointments.map((entry) =>
                entry.id === appointmentId ? keepLocal(row, entry) : entry,
              ),
            }));
          })
          .catch(() => undefined);
        return set((state) => {
          const appointments = state.appointments.map((a) =>
            a.id === appointmentId
              ? {
                  ...a,
                  stage: 'completed' as AppointmentStage,
                  completedAt: new Date().toISOString(),
                  paidWith,
                  tip,
                }
              : a,
          );
          /* Roll the payment straight into today's takings so the earnings
             screen matches the queue without a refresh.

             This block is untouched on purpose. EarningsPage runs its own
             10%-of-gross economy off these synthetic rows, `EarningsDay.takings`
             is keyed by the five real methods with no bucket for "nobody said",
             and `net` is derived from `total` — the customer's bill, fee
             included. Making that real is a separate job; changing the basis
             here would only make the two disagree. */
          const today = todayKey();
          const done = appointments.filter((a) => a.date === today && a.stage === 'completed');
          const takings: Record<TakingsMethod, number> = { cash: 0, bkash: 0, nagad: 0, rocket: 0, card: 0 };
          let tips = 0;
          for (const entry of done) {
            takings[entry.paidWith ?? 'cash'] += entry.total;
            tips += entry.tip ?? 0;
          }
          const gross = Object.values(takings).reduce((sum, value) => sum + value, 0);
          const row: EarningsDay = {
            date: today,
            appointments: done.length,
            takings,
            tips,
            net: Math.round(gross * 0.9) + tips,
          };
          const earnings = state.earnings.some((day) => day.date === today)
            ? state.earnings.map((day) => (day.date === today ? row : day))
            : [...state.earnings, row];
          return { appointments, earnings };
        });
      },

      /* The server creates this, not us.
         It used to be minted here with a local id and pushed straight into the
         store, which meant it existed on one device and nowhere else: the owner
         never saw it, and the next refresh — which replaces the diary with the
         server's answer — quietly threw it away. */
      addWalkIn: async ({ customerName, customerPhone, serviceIds, staffId, notes }) => {
        const booking = await bookingService.addWalkIn({
          customerName,
          customerPhone,
          serviceIds,
          employeeId: staffId,
          notes,
        });
        const appointment = toProviderAppointment(booking);
        if (!appointment) return null;
        set((state) => ({
          appointments: [
            ...state.appointments.filter((row) => row.id !== appointment.id),
            appointment,
          ],
        }));
        return appointment;
      },

      reassign: (appointmentId, staffId) =>
        set((state) => {
          const member = state.staff.find((s) => s.id === staffId);
          return {
            appointments: state.appointments.map((a) =>
              a.id === appointmentId ? { ...a, staffId, staffName: member?.name } : a,
            ),
          };
        }),

      /* ---- profile ---- */

      updateProfile: async (patch) => {
        const payload = await profileService.update(patch);
        const profile = toProviderProfile(payload);
        if (profile) set({ profile });
        // An employee edits the name on their account here, not a trading
        // name on a business, so the signed-in user goes stale otherwise.
        if (patch.name !== undefined) useAppStore.getState().setUser(toUser(payload));
      },

      setAutoAccept: async (on) => {
        await get().updateProfile({ auto_accept: on });
      },

      addGalleryImage: async (image, caption = '') => {
        await profileService.addGalleryImage(image, caption);
        const payload = await profileService.get();
        const profile = toProviderProfile(payload);
        if (profile) set({ profile });
      },

      removeGalleryImage: async (id) => {
        await profileService.removeGalleryImage(id);
        const payload = await profileService.get();
        const profile = toProviderProfile(payload);
        if (profile) set({ profile });
      },

      /* ---- services ---- */

      addService: async (payload) => {
        const service = await catalogService.createService(payload);
        set((state) => ({ services: [...state.services, service] }));
        return service;
      },

      updateService: async (id, payload) => {
        const service = await catalogService.updateService(id, payload);
        set((state) => ({
          services: state.services.map((existing) => (existing.id === id ? service : existing)),
        }));
      },

      removeService: async (id) => {
        await catalogService.removeService(id);
        set((state) => ({ services: state.services.filter((service) => service.id !== id) }));
      },

      addCategory: async (name) => {
        const category = await catalogService.createCategory(name);
        set((state) => ({ categories: [...state.categories, category] }));
        return category;
      },

      /* ---- staff ---- */

      addStaff: async (payload) => {
        const member = await staffService.create(payload);
        set((state) => ({ staff: [member, ...state.staff] }));
        return member;
      },

      updateStaff: async (id, patch) => {
        const member = await staffService.update(id, patch);
        set((state) => ({
          staff: state.staff.map((existing) => (existing.id === id ? member : existing)),
        }));
      },

      removeStaff: async (id) => {
        await staffService.remove(id);
        set((state) => ({ staff: state.staff.filter((member) => member.id !== id) }));
        // A service pinned to that chair has lost one of its names, so the
        // list on screen is out of date until it is read back.
        set({ services: await catalogService.listServices() });
      },

      /* ---- working hours ---- */

      saveSchedule: async (days) => {
        set({ schedule: await scheduleService.saveMine(days) });
      },

      resetSchedule: async () => {
        set({ schedule: await scheduleService.clearMine() });
      },

      /* ---- money ---- */
      addPayoutAccount: (account) =>
        set((state) => {
          if (!state.profile) return {};
          const created: PayoutAccount = { ...account, id: nextId('PAY'), providerId: state.profile.id };
          const accounts = created.isDefault
            ? state.payoutAccounts.map((a) => ({ ...a, isDefault: false }))
            : state.payoutAccounts;
          return { payoutAccounts: [...accounts, created] };
        }),

      setDefaultPayoutAccount: (id) =>
        set((state) => ({
          payoutAccounts: state.payoutAccounts.map((a) => ({ ...a, isDefault: a.id === id })),
        })),

      removePayoutAccount: (id) =>
        set((state) => ({ payoutAccounts: state.payoutAccounts.filter((a) => a.id !== id) })),

      /* ---- lookbook ---- */
      addLookbookItem: (item) =>
        set((state) => {
          if (!state.profile) return {};
          return {
            lookbook: [
              { ...item, id: nextId('LKB'), providerId: state.profile.id, createdAt: new Date().toISOString() },
              ...state.lookbook,
            ],
          };
        }),

      updateLookbookItem: (id, patch) =>
        set((state) => ({
          lookbook: state.lookbook.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),

      removeLookbookItem: (id) =>
        set((state) => ({ lookbook: state.lookbook.filter((item) => item.id !== id) })),
    }),
    { name: STORAGE_KEYS.provider },
  ),
);
