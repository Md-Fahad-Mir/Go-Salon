/* Who gets the AI try-on in their bar: the customer, and a salon's own people
   — the owner and the stylists. An independent barber does not. */

import { describe, expect, it } from 'vitest';
import { ROUTES } from '../../constants';
import { navTabsFor } from './navTabs';

const hasTryOn = (role: Parameters<typeof navTabsFor>[0]) =>
  navTabsFor(role).some((tab) => tab.to === ROUTES.tryOn);

describe('the Try on tab', () => {
  it('is in the customer, salon owner and salon employee bars', () => {
    expect(hasTryOn('customer')).toBe(true);
    expect(hasTryOn('salon_owner')).toBe(true);
    expect(hasTryOn('salon_employee')).toBe(true);
  });

  it('is not in an independent barber’s bar', () => {
    expect(hasTryOn('barber')).toBe(false);
  });

  it('sits in the middle for the salon: after Requests', () => {
    const owner = navTabsFor('salon_owner').map((tab) => tab.labelKey);
    expect(owner).toEqual(['nav.home', 'nav.requests', 'nav.tryOn', 'nav.staff', 'nav.profile']);
    const employee = navTabsFor('salon_employee').map((tab) => tab.labelKey);
    expect(employee).toEqual(['nav.today', 'nav.requests', 'nav.tryOn', 'nav.profile']);
  });
});
