/* Home: the salon the customer is in.

   Several screens under one route, chosen by the store's tenancy — the active
   salon's profile, the way to a first salon, the question "which one?", and
   the honest in-betweens: the list not read yet, the list unreadable, the
   listing loading or failed. The first has to follow the active salon
   *without* a navigation, which is new: no screen whose data depends on the
   salon re-rendered on it before. */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { useDirectoryStore } from '../store/useDirectoryStore';
import { requestsTo, route, sent, serve } from '../test/http';
import { listingWire, reviewsWire } from '../test/listing';
import { mount } from '../test/render';
import type { Tenant, User } from '../types';
import HomePage from './HomePage';

const ALPHA: Tenant = { id: 4, slug: 'alpha', listingId: 'salon-4', name: 'Aurora Salon', avatar: '' };
const BETA: Tenant = { id: 5, slug: 'beta', listingId: 'salon-5', name: 'Bluebell Parlour', avatar: '' };

const customer = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z', credits: 3,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  useDirectoryStore.getState().clear();
  store().setAuthStatus('ready');
  store().setSession({ user: customer(), access: 'a', refresh: 'r' });
});

/** The list as `loadTenants` leaves it once the server has answered. */
const settled = (tenants: Tenant[]) => {
  store().setTenants(tenants);
  useAppStore.setState({ tenantsStatus: 'ready' });
};

/** Both salons' listings and reviews, so any switch can be answered. */
const serveSalons = () =>
  route([
    ['/listings/salon-4/', { status: 200, body: listingWire() }],
    ['/reviews/listing/salon-4/', { status: 200, body: reviewsWire() }],
    ['/listings/salon-5/', { status: 200, body: listingWire({ id: 'salon-5', name: 'Bluebell Parlour' }) }],
    ['/reviews/listing/salon-5/', { status: 200, body: reviewsWire('salon-5', 'Bluebell Parlour') }],
  ]);

const open = () =>
  mount({
    at: '/home',
    routes: {
      '/home': <HomePage />,
      '/profile/settings': <p>the settings screen</p>,
      '/notifications': <p>the notifications screen</p>,
    },
    elsewhere: <p>somewhere else</p>,
  });

/** The hours row on a salon profile — the one piece of local UI state the
    page keeps open or shut, which is what proves a remount. */
const hoursToggle = () => screen.getByRole('button', { name: /Hours$/ });

describe('with one salon, which is therefore the active one', () => {
  beforeEach(() => {
    settled([ALPHA]);
    serveSalons();
  });

  it('is that salon’s profile, fetched by its listing id', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Aurora Salon' })).toBeInTheDocument();
    expect(screen.getByText('Haircut')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book an appointment' })).toBeInTheDocument();
    expect(requestsTo('/listings/salon-4/')).toHaveLength(1);
  });

  it('has no back arrow — Home is where Back goes', async () => {
    open();
    await screen.findByRole('heading', { name: 'Aurora Salon' });
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
  });

  it('keeps the bell, the one way into notifications', async () => {
    open();
    await screen.findByRole('heading', { name: 'Aurora Salon' });
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText('the notifications screen')).toBeInTheDocument();
  });
});

describe('switching salons while Home is open', () => {
  beforeEach(() => {
    settled([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);
    serveSalons();
  });

  it('follows the active salon alone — the list does not change', async () => {
    open();
    await screen.findByRole('heading', { name: 'Aurora Salon' });

    // Only `activeTenantId` moves. If Home re-rendered only on `tenants`, this
    // would sit on Aurora for ever.
    act(() => store().setActiveTenant(BETA.id));

    expect(await screen.findByRole('heading', { name: 'Bluebell Parlour' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Aurora Salon' })).not.toBeInTheDocument();
    expect(requestsTo('/listings/salon-5/')).toHaveLength(1);
  });

  it('opens the new salon fresh, not with the old one’s page state', async () => {
    open();
    await screen.findByRole('heading', { name: 'Aurora Salon' });
    await userEvent.click(hoursToggle());
    expect(hoursToggle()).toHaveAttribute('aria-expanded', 'true');

    act(() => store().setActiveTenant(BETA.id));
    await screen.findByRole('heading', { name: 'Bluebell Parlour' });

    // Without `key`, the same component would carry Aurora's open hours table
    // onto Bluebell's page. A fresh mount starts it shut.
    expect(hoursToggle()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('while the active salon’s listing is loading or has failed', () => {
  beforeEach(() => settled([ALPHA]));

  it('waits in Home’s own frame: no back arrow, the bell still there', () => {
    // A listing that never answers.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    open();

    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('offers to try again, not to go "back to home" from Home', async () => {
    route([
      ['/listings/salon-4/', { status: 500 }],
      ['/reviews/listing/salon-4/', { status: 200, body: reviewsWire() }],
    ]);
    open();

    expect(await screen.findByText('We could not load that')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();

    // The server recovers; the retry has to ask again, and show the salon.
    serveSalons();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Aurora Salon' })).toBeInTheDocument();
    expect(requestsTo('/listings/salon-4/')).toHaveLength(1);
  });
});

describe('with no salon at all', () => {
  it('says how to get one, and points at Settings rather than opening the camera', async () => {
    settled([]);
    serve(); // any request would throw: this state needs nothing from the server
    open();

    expect(screen.getByText('No salons yet')).toBeInTheDocument();
    expect(screen.getByText(/Scan the QR code in a salon/)).toBeInTheDocument();
    const way = screen.getByRole('link', { name: 'Add a salon in Settings' });
    expect(way).toHaveAttribute('href', '/profile/settings');
    await userEvent.click(way);
    expect(screen.getByText('the settings screen')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('shows a failed read as a failure, not as an empty account', () => {
    store().setTenants([]);
    useAppStore.setState({ tenantsStatus: 'error' });
    serve();
    open();

    expect(screen.getByText('We could not load your salons')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('No salons yet')).not.toBeInTheDocument();
  });
});

describe('before the list has been read — every fresh sign-in', () => {
  /* `setSession` empties the list and `loadTenants` refills it. Until it has,
     an empty list means "not known yet", and a customer with three salons
     must not be told they have none. */
  for (const status of ['idle', 'loading'] as const) {
    it(`waits rather than claiming there are no salons (${status})`, () => {
      store().setTenants([]);
      useAppStore.setState({ tenantsStatus: status });
      serve();
      open();

      expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
      expect(screen.queryByText('No salons yet')).not.toBeInTheDocument();
      expect(sent).toHaveLength(0);
    });
  }

  it('then shows the answer once it lands', async () => {
    store().setTenants([]);
    useAppStore.setState({ tenantsStatus: 'loading' });
    serveSalons();
    open();

    act(() => settled([ALPHA]));
    expect(await screen.findByRole('heading', { name: 'Aurora Salon' })).toBeInTheDocument();
  });
});

describe('with several salons and none chosen — every fresh sign-in', () => {
  beforeEach(() => {
    settled([ALPHA, BETA]);
    serveSalons();
  });

  it('starts with no active salon, by design', () => {
    expect(store().activeTenantId).toBeNull();
  });

  it('asks which salon, listing them all, and fetches nothing yet', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Which salon are you visiting?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aurora Salon/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bluebell Parlour/ })).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('opens the one that is tapped, making it the active salon', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: /Bluebell Parlour/ }));

    expect(store().activeTenantId).toBe(BETA.id);
    expect(await screen.findByRole('heading', { name: 'Bluebell Parlour' })).toBeInTheDocument();
    expect(screen.queryByText('Which salon are you visiting?')).not.toBeInTheDocument();
    expect(requestsTo('/listings/salon-5/')).toHaveLength(1);
    expect(requestsTo('/listings/salon-4/')).toHaveLength(0);
  });
});

describe('a chosen salon with no listing id to open it by', () => {
  /* A list persisted by a build older than `listingId`. The picker would be
     the wrong answer: it would offer the chosen salon as unchosen, and a tap
     on it would change nothing. */
  const OLD: Tenant = { ...ALPHA, listingId: '' };

  it('waits while the refresh that will replace it is under way', () => {
    store().setTenants([OLD]);
    useAppStore.setState({ tenantsStatus: 'loading' });
    serve();
    open();

    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.queryByText('Which salon are you visiting?')).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('offers a retry, not a picker, once the refresh has finished without one', () => {
    settled([OLD]);
    serve();
    const { container } = open();

    expect(store().activeTenantId).toBe(OLD.id);
    expect(screen.getByText('We could not load your salons')).toBeInTheDocument();
    expect(within(container).queryByRole('button', { name: /Aurora Salon/ })).not.toBeInTheDocument();
    expect(requestsTo('/listings/')).toHaveLength(0);
  });
});
