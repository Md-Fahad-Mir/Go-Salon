/* Home's salon list — the way into booking now that there is no marketplace. */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { NAV_TABS } from '../layout/navTabs';
import { useAppStore } from '../../store/useAppStore';
import { sent, serve } from '../../test/http';
import { mount } from '../../test/render';
import type { Tenant, User } from '../../types';
import { YourSalons } from './YourSalons';

const ALPHA: Tenant = {
  id: 4, slug: 'aurora', listingId: 'salon-4', name: 'Aurora Salon', avatar: '',
};
const BETA: Tenant = {
  id: 5, slug: 'bluebell', listingId: 'barber-9', name: 'Bluebell Parlour', avatar: '',
};

const someone = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z', credits: 3,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
  store().setSession({ user: someone(), access: 'a', refresh: 'r' });
});

/** Home's list, plus a stand-in for the wizard it opens. */
const open = () =>
  mount({
    at: '/home',
    routes: {
      '/home': <YourSalons />,
      '/booking/:professionalId/service': <p>the booking wizard</p>,
    },
  });

describe('a customer with salons', () => {
  beforeEach(() => store().setTenants([ALPHA, BETA]));

  it('lists every salon they have joined', () => {
    open();
    expect(screen.getByText('Aurora Salon')).toBeInTheDocument();
    expect(screen.getByText('Bluebell Parlour')).toBeInTheDocument();
  });

  it('points each row at that salon’s booking wizard', () => {
    open();
    // The listing id, not the tenant id — they are different numbers, and the
    // wizard is addressed by the former.
    expect(screen.getByRole('link', { name: 'Book at Aurora Salon' }))
      .toHaveAttribute('href', '/booking/salon-4/service');
    // A lone barber is a `barber-<pk>` listing, and works the same way.
    expect(screen.getByRole('link', { name: 'Book at Bluebell Parlour' }))
      .toHaveAttribute('href', '/booking/barber-9/service');
  });

  it('opens the wizard when a salon is tapped', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('link', { name: 'Book at Aurora Salon' }));
    expect(await screen.findByText('the booking wizard')).toBeInTheDocument();
  });

  it('does not fetch anything of its own', () => {
    serve(); // any request at all would throw
    open();
    // `loadTenants` already ran at sign-in; this screen reads what is there.
    expect(sent).toHaveLength(0);
  });

  it('shows no spinner while a refresh is in flight', () => {
    store().setTenants([ALPHA]);
    useAppStore.setState({ tenantsStatus: 'loading' });
    open();
    // The same rule as the switcher: a list already in hand is shown, because
    // covering it with a spinner would hide something usable.
    expect(screen.getByText('Aurora Salon')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('a customer with no salons', () => {
  it('says how to add one, and links nowhere', () => {
    store().setTenants([]);
    const { container } = open();

    expect(screen.getByText('No salons yet')).toBeInTheDocument();
    expect(screen.getByText(/Scan the QR code in a salon/)).toBeInTheDocument();
    // Nothing to offer until F3b builds the scanner — and the only other
    // screen this could have pointed at is the withdrawn search.
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('when the list could not be read', () => {
  it('offers a retry when there is nothing cached to fall back on', async () => {
    const user = userEvent.setup();
    store().setTenants([]);
    serve('unreachable');
    await store().loadTenants();
    expect(store().tenantsStatus).toBe('error');

    open();
    expect(screen.getByText('We could not load your salons')).toBeInTheDocument();

    serve({ status: 200, body: [{ ...ALPHA, listing_id: ALPHA.listingId }] });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Aurora Salon')).toBeInTheDocument();
  });

  it('keeps showing the last list rather than an error, when it has one', async () => {
    store().setTenants([ALPHA]);
    serve('unreachable');
    await store().loadTenants();

    open();
    // `loadTenants` leaves the previous list alone, so there is something
    // usable on screen; an error card instead would be a regression.
    expect(screen.getByText('Aurora Salon')).toBeInTheDocument();
    expect(screen.queryByText('We could not load your salons')).not.toBeInTheDocument();
  });
});

describe('the customer’s bottom bar', () => {
  it('no longer offers Search', () => {
    const paths = NAV_TABS.customer.map((tab) => tab.to);
    expect(paths).not.toContain('/search');
    expect(paths).toHaveLength(4);
    expect(paths[0]).toBe('/home');
  });
});
