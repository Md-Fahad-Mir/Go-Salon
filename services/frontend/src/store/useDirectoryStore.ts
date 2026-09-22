import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../constants';
import type { Professional, Service, StaffMember } from '../types';
import type { DirectoryDetail } from '../utils/directoryService';

/* Every salon and barber this device has seen.

   The directory is fetched, but half the customer app looks a professional up
   *by id, synchronously* — a saved card, a booking in the history, the wizard
   working out what is on the menu. Those screens have no business each firing
   their own request, and a booking made last week still has to render its
   salon's name today.

   So whatever the directory hands back is kept here, and the lookups below
   read from it. It is persisted for the same reason: a favourite has to
   survive a reload, and re-fetching every provider on boot to render one card
   would be worse than remembering them. */

interface DirectoryState {
  byId: Record<string, Professional>;
  servicesById: Record<string, Service[]>;
  staffById: Record<string, StaffMember[]>;

  /** Keeps every listing a search or a nearby call returned. */
  remember: (list: Professional[]) => void;
  /** Keeps a full listing, with the menu and the chairs that came with it. */
  rememberDetail: (detail: DirectoryDetail) => void;
  clear: () => void;
}

export const useDirectoryStore = create<DirectoryState>()(
  persist(
    (set) => ({
      byId: {},
      servicesById: {},
      staffById: {},

      remember: (list) =>
        set((state) => {
          if (list.length === 0) return {};
          const byId = { ...state.byId };
          for (const pro of list) {
            // A list row carries less than a detail row, so what is already
            // known is kept and only refreshed where the list is newer.
            byId[pro.id] = { ...byId[pro.id], ...pro };
          }
          return { byId };
        }),

      rememberDetail: ({ professional, services, staff }) =>
        set((state) => ({
          byId: { ...state.byId, [professional.id]: professional },
          servicesById: { ...state.servicesById, [professional.id]: services },
          staffById: { ...state.staffById, [professional.id]: staff },
        })),

      clear: () => set({ byId: {}, servicesById: {}, staffById: {} }),
    }),
    {
      name: STORAGE_KEYS.directory,
      /* Bump this whenever the shape of a cached listing changes.
       *
       * A listing written by an older build is not a listing this one can
       * read, and the failure is silent rather than loud: when chairs gained
       * an `hours` field, every cache written before it read as "this chair
       * has no week", which the calendar rendered as a month of dead dates
       * with nothing to explain them. Discarding is the only safe answer —
       * this is a cache, and every screen that uses it re-fetches.
       */
      version: 1,
      migrate: () => ({ byId: {}, servicesById: {}, staffById: {} }) as DirectoryState,
    },
  ),
);

/* --- The synchronous lookups the rest of the app uses --------------------- */

/** A professional this device has seen, or undefined. Undefined is a real
    answer: a listing can be removed, and a screen has to cope with that. */
export const getProfessional = (id: string): Professional | undefined =>
  useDirectoryStore.getState().byId[id];

/** What is on their menu. Empty until their detail page has been opened —
    the wizard always comes through it, so by then it is filled in. */
export const getServicesFor = (professionalId: string): Service[] =>
  useDirectoryStore.getState().servicesById[professionalId] ?? [];

/** Their chairs. Empty for a barber working alone, which is not a gap. */
export const getStaffFor = (professionalId: string): StaffMember[] =>
  useDirectoryStore.getState().staffById[professionalId] ?? [];
