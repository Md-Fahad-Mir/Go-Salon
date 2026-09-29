import { CalendarDays, Home, ListChecks, Sparkles, Users, UserRound } from 'lucide-react';
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

     barber, employee:  Today  ->  Requests  ->  Profile
     salon owner:       Home   ->  Requests  ->  Staff    ->  Profile

   **Staff** and the salon's profile belong to whoever owns the place. A barber
   working for themselves has no roster and no salon record; an employee has a
   chair in somebody else's salon, not a salon. Both of them get their own
   **Profile** instead, since there is no business of their own to open.

   There is no Settings for a professional. Language and light/dark sit in the
   header of each role's home screen, and the password and signing out at the
   foot of each role's Profile. Everything a professional owns but does not
   touch hourly — the calendar, the price list, takings, analytics — is
   reached from Profile too. */
export const NAV_TABS: Record<UserRole, NavTab[]> = {
  customer: [
    /* Four, not five. The Search tab led to the cross-salon directory, which
       is withdrawn — and since Step 6g a customer can only read a salon they
       have joined, so the screen behind it now refuses most of what it lists.
       Home is the honest entry point: the salons they can actually book at. */
    { to: ROUTES.home, labelKey: 'nav.home', icon: Home, match: ['/home', '/hairstyle', '/professional', '/notifications'] },
    { to: ROUTES.tryOn, labelKey: 'nav.tryOn', icon: Sparkles, match: ['/ai-tryon'], hero: true },
    { to: ROUTES.bookings, labelKey: 'nav.bookings', icon: CalendarDays, match: ['/bookings', '/booking'] },
    { to: ROUTES.profile, labelKey: 'nav.profile', icon: UserRound, match: ['/profile'] },
  ],

  barber: [
    { to: ROUTES.proQueue, labelKey: 'nav.today', icon: CalendarDays, match: ['/pro/queue'], hero: true },
    { to: ROUTES.proRequests, labelKey: 'nav.requests', icon: ListChecks, match: ['/pro/requests', '/pro/appointment'] },
    { to: ROUTES.proProfile, labelKey: 'nav.profile', icon: UserRound, match: ['/pro/profile', '/pro/portfolio', '/pro/earnings', '/pro/calendar', '/pro/services', '/pro/treatments', '/pro/clients', '/pro/lookbook'] },
  ],

  salon_owner: [
    { to: ROUTES.proSalonQueue, labelKey: 'nav.home', icon: Home, match: ['/pro/salon/queue'], hero: true },
    { to: ROUTES.proRequests, labelKey: 'nav.requests', icon: ListChecks, match: ['/pro/requests', '/pro/appointment'] },
    { to: ROUTES.proSalonStaff, labelKey: 'nav.staff', icon: Users, match: ['/pro/salon/staff'] },
    // The salon's whole portfolio: who it is, where, when it opens, the menu,
    // the team and the pictures. The gallery screen it links out to counts as
    // part of it, so the tab stays lit there.
    { to: ROUTES.proSalonProfile, labelKey: 'nav.profile', icon: UserRound, match: ['/pro/salon/profile', '/pro/portfolio', '/pro/salon/services', '/pro/salon/analytics'] },
  ],

  salon_employee: [
    { to: ROUTES.proQueue, labelKey: 'nav.today', icon: CalendarDays, match: ['/pro/queue'], hero: true },
    { to: ROUTES.proRequests, labelKey: 'nav.requests', icon: ListChecks, match: ['/pro/requests', '/pro/appointment'] },
    { to: ROUTES.proProfile, labelKey: 'nav.profile', icon: UserRound, match: ['/pro/profile', '/pro/shift', '/pro/performance'] },
  ],

  // An admin's tools are the backend's own admin site, so there is no bar.
  admin: [],
};

/** The bottom bar for whoever is signed in.
 *
 *  Audience no longer changes it. A women's hairstylist is a hairstylist —
 *  the same role and the same four things — and her clients, treatments and
 *  lookbook are reached from Profile alongside everybody else's.
 */
export const navTabsFor = (role: UserRole): NavTab[] => NAV_TABS[role];
