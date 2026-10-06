import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BookingDraft } from '../types';
import { STORAGE_KEYS } from '../constants';

interface BookingStore {
  draft: BookingDraft | null;
  /** Start a fresh wizard for a professional. Keeps the draft if it is for the
      same professional and no reschedule, so Back/Forward does not wipe it. */
  start: (
    professionalId: string,
    options?: {
      hairstyleId?: string;
      rescheduleOf?: string;
      serviceIds?: string[];
      staffId?: string;
      /** `true` from a stylist's own "Book with" button, which skips choosing
          a stylist; `false` from the salon's "Book an appointment", which
          always offers the choice; left out when the wizard re-enters its
          own draft, so the draft keeps whichever it was. */
      staffLocked?: boolean;
    },
  ) => void;
  toggleService: (serviceId: string) => void;
  setServices: (serviceIds: string[]) => void;
  setStaff: (staffId: string) => void;
  setDateTime: (date?: string, time?: string) => void;
  setNotes: (notes: string) => void;
  setAgreedPolicy: (agreed: boolean) => void;
  setSmsReminder: (on: boolean) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingStore>()(
  persist(
    (set, get) => ({
      draft: null,

      start: (professionalId, options = {}) => {
        const current = get().draft;
        const sameFlow =
          current &&
          current.professionalId === professionalId &&
          (current.rescheduleOf ?? null) === (options.rescheduleOf ?? null) &&
          !options.serviceIds;
        if (sameFlow) {
          let next = current;
          if (options.hairstyleId && !current.hairstyleId) {
            next = { ...next, hairstyleId: options.hairstyleId };
          }
          // Back out of "Book with Sara", press "Book an appointment": the
          // stylist step has to come back, with Sara still ticked on it.
          if (options.staffLocked === false && current.staffLocked) {
            next = { ...next, staffLocked: undefined };
          }
          if (next !== current) set({ draft: next });
          return;
        }
        set({
          draft: {
            professionalId,
            serviceIds: options.serviceIds ?? [],
            staffId: options.staffId ?? 'any',
            notes: '',
            agreedPolicy: false,
            smsReminder: true,
            rescheduleOf: options.rescheduleOf,
            hairstyleId: options.hairstyleId,
            staffLocked: options.staffLocked || undefined,
          },
        });
      },

      toggleService: (serviceId) => {
        const draft = get().draft;
        if (!draft) return;
        const serviceIds = draft.serviceIds.includes(serviceId)
          ? draft.serviceIds.filter((id) => id !== serviceId)
          : [...draft.serviceIds, serviceId];
        // Changing the services changes the duration, so any picked time is stale.
        set({ draft: { ...draft, serviceIds, time: undefined } });
      },

      setServices: (serviceIds) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, serviceIds, time: undefined } });
      },

      setStaff: (staffId) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, staffId, time: undefined } });
      },

      setDateTime: (date, time) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, date, time } });
      },

      setNotes: (notes) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, notes } });
      },


      setAgreedPolicy: (agreedPolicy) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, agreedPolicy } });
      },

      setSmsReminder: (smsReminder) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, smsReminder } });
      },

      reset: () => set({ draft: null }),
    }),
    {
      name: STORAGE_KEYS.booking,
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
