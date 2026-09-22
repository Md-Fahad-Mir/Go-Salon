import { CalendarDays, Home, ListChecks, Search, Settings, Sparkles, Users, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES } from '../../constants';
import type { TranslationKey } from '../../i18n';
import type { UserRole } from '../../types';

export interface NavTab {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  /** Path prefixes that light this tab up. */
  match: string[];
  /** The one tab that gets the accent treatment. */
  hero?: boolean;
}

/* The customer's bar is their own. The three professional bars share one
   shape, and differ only where the role genuinely differs:

     Today  ->  Requests  ->  [ Staff  ->  Salon  |  Profile ]  ->  Settings

   **Staff** and **Salon** belong to whoever owns the place. A barber working
   for themselves has no roster and no salon record; an employee has a chair in
   somebody else's salon, not a salon. Both of them get **Profile** in that
   space instead — themselves, since there is no business of their own to open.

   Settings is last for all three. Everything a professional owns but does not
   touch hourly — the calendar, the price list, takings, analytics — is reached
   from there, so cutting the bar back did not cut anything off. */
export const NAV_TABS: Record<UserRole, NavTab[]> = {
  customer: [
    { to: ROUTES.home, labelKey: 'nav.home', icon: Home, match: ['/home', '/hairstyle', '/professional', '/notifications'] },
    { to: ROUTES.search, labelKey: 'nav.search', icon: Search, match: ['/search'] },
    { to: ROUTES.tryOn, labelKey: 'nav.tryOn', icon: Sparkles, match: ['/ai-tryon'], hero: true },
    { to: ROUTES.bookings, labelKey: 'nav.bookings', icon: CalendarDays, match: ['/bookings', '/booking'] },
    { to: ROUTES.profile, labelKey: 'nav.profile', icon: UserRound, match: ['/profile'] },
  ],

  barber: [
    { to: ROUTES.proQueue, labelKey: 'nav.today', icon: CalendarDays, match: ['/pro/queue'], hero: true },
    { to: ROUTES.proRequests, labelKey: 'nav.requests', icon: ListChecks, match: ['/pro/requests', '/pro/appointment'] },
    { to: ROUTES.proProfile, labelKey: 'nav.profile', icon: UserRound, match: ['/pro/profile', '/pro/portfolio', '/pro/earnings', '/pro/calendar', '/pro/services', '/pro/treatments', '/pro/clients', '/pro/lookbook'] },
    { to: ROUTES.proSettings, labelKey: 'nav.settings', icon: Settings, match: ['/pro/settings'] },
  ],

  salon_owner: [
    { to: ROUTES.proSalonQueue, labelKey: 'nav.today', icon: CalendarDays, match: ['/pro/salon/queue'], hero: true },
    { to: ROUTES.proRequests, labelKey: 'nav.requests', icon: ListChecks, match: ['/pro/requests', '/pro/appointment'] },
    { to: ROUTES.proSalonStaff, labelKey: 'nav.staff', icon: Users, match: ['/pro/salon/staff'] },
    // The salon's whole portfolio: who it is, where, when it opens, the menu,
    // the team and the pictures. The gallery screen it links out to counts as
    // part of it, so the tab stays lit there.
    { to: ROUTES.proSalonProfile, labelKey: 'nav.salon', icon: Home, match: ['/pro/salon/profile', '/pro/portfolio', '/pro/salon/services', '/pro/salon/analytics'] },
    { to: ROUTES.proSettings, labelKey: 'nav.settings', icon: Settings, match: ['/pro/settings'] },
  ],

  salon_employee: [
    { to: ROUTES.proQueue, labelKey: 'nav.today', icon: CalendarDays, match: ['/pro/queue'], hero: true },
    { to: ROUTES.proRequests, labelKey: 'nav.requests', icon: ListChecks, match: ['/pro/requests', '/pro/appointment'] },
    { to: ROUTES.proProfile, labelKey: 'nav.profile', icon: UserRound, match: ['/pro/profile', '/pro/shift', '/pro/performance'] },
    { to: ROUTES.proSettings, labelKey: 'nav.settings', icon: Settings, match: ['/pro/settings'] },
  ],

  // An admin's tools are the backend's own admin site, so there is no bar.
  admin: [],
};

/** The bottom bar for whoever is signed in.
 *
 *  Audience no longer changes it. A women's hairstylist is a hairstylist —
 *  the same role and the same four things — and her clients, treatments and
 *  lookbook are reached from Settings alongside everybody else's.
 */
export const navTabsFor = (role: UserRole): NavTab[] => NAV_TABS[role];
