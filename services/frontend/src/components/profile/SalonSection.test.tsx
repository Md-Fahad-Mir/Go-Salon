/* The salon switcher, in Settings.

   The component, the store and the api client are the real ones; only `fetch`
   is faked. */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { sent, serve } from '../../test/http';
import { mount } from '../../test/render';
import type { Tenant, User } from '../../types';
import { SalonSection } from './SalonSection';

const ALPHA: Tenant = { id: 4, slug: 'alpha', listingId: 'salon-4', name: 'Aurora Salon', avatar: '' };
const BETA: Tenant = { id: 5, slug: 'beta', listingId: 'salon-5', name: 'Bluebell Parlour', avatar: '' };

const someone = (role: User['role']): User => ({
  id: 'U1',
  name: 'Test Person',
  role,
  phone: '+8801955000009',
  createdAt: '2026-01-01T00:00:00.000Z',
  credits: 3,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
});

const signIn = (role: User['role'] = 'customer') =>
  store().setSession({ user: someone(role), access: 'a', refresh: 'r' });

/** The switcher, plus a stand-in for wherever a switch might send someone. */
const open = () =>
  mount({
    at: '/profile/settings',
    routes: { '/profile/settings': <SalonSection /> },
    elsewhere: <p>the landing screen</p>,
  });

const salonRows = () => screen.queryAllByRole('radio');

describe('when there is a choice to make', () => {
  beforeEach(() => {
    signIn();
    store().setTenants([ALPHA, BETA]);
  });

  it('lists every salon by name', () => {
    open();
    expect(salonRows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Aurora Salon'),
      expect.stringContaining('Bluebell Parlour'),
    ]);
  });

  it('marks the active salon and only that one', () => {
    store().setActiveTenant(BETA.id);
    open();

    const [aurora, bluebell] = salonRows();
    expect(aurora).toHaveAttribute('aria-checked', 'false');
    expect(bluebell).toHaveAttribute('aria-checked', 'true');
    expect(bluebell).toHaveTextContent('Showing now');
  });

  it('switches to the salon that was tapped', async () => {
    const user = userEvent.setup();
    store().setActiveTenant(ALPHA.id);
    open();

    await user.click(screen.getByRole('radio', { name: /Bluebell Parlour/ }));
    expect(store().activeTenantId).toBe(BETA.id);
  });

  it('leaves the screen it was on, because the old one was about the old salon', async () => {
    const user = userEvent.setup();
    store().setActiveTenant(ALPHA.id);
    open();

    await user.click(screen.getByRole('radio', { name: /Bluebell Parlour/ }));
    // A booking, a roster or an appointment id from the previous salon is a
    // 404 under this one; the landing route is the screen that means the same
    // thing whichever salon is active.
    expect(await screen.findByText('the landing screen')).toBeInTheDocument();
  });

  it('does nothing when the salon already showing is tapped again', async () => {
    const user = userEvent.setup();
    store().setActiveTenant(ALPHA.id);
    open();

    await user.click(screen.getByRole('radio', { name: /Aurora Salon/ }));
    expect(store().activeTenantId).toBe(ALPHA.id);
    // No pointless navigation away from the screen they are reading.
    expect(screen.queryByText('the landing screen')).not.toBeInTheDocument();
  });

  it('sends an owner to the owner’s landing screen, not the customer’s', async () => {
    const user = userEvent.setup();
    useAppStore.setState(PRISTINE, true);
    store().setAuthStatus('ready');
    signIn('salon_owner');
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);

    mount({
      at: '/profile/settings',
      routes: { '/profile/settings': <SalonSection /> },
      elsewhere: <p>the landing screen</p>,
    });

    await user.click(screen.getByRole('radio', { name: /Bluebell Parlour/ }));
    expect(store().activeTenantId).toBe(BETA.id);
    expect(await screen.findByText('the landing screen')).toBeInTheDocument();
  });
});

describe('when there is nothing to choose between', () => {
  it('renders nothing for an owner with one shop', () => {
    signIn('salon_owner');
    store().setTenants([ALPHA]);
    const { container } = open();

    // One salon is not a choice — the backend resolves a sole tenant from the
    // account anyway — and there is no leaving a shop you own, so there is
    // nothing for this section to offer.
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders for a customer with one salon, so they can leave it', () => {
    signIn();
    store().setTenants([ALPHA]);
    open();

    // Nothing to switch between, but a door out has to exist somewhere.
    expect(screen.getByRole('radio', { name: /Aurora Salon/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove a salon' })).toBeInTheDocument();
  });

  it('renders nothing for a customer who has joined none', () => {
    signIn();
    store().setTenants([]);
    const { container } = open();
    expect(container).toBeEmptyDOMElement();
  });

  for (const role of ['barber', 'salon_employee'] as const) {
    it(`renders nothing for a ${role}, who can only ever have one`, () => {
      signIn(role);
      // Even if something had put a list on the store, this role has no
      // choice to make: the schema bounds them to a single tenant.
      store().setTenants([ALPHA, BETA]);
      const { container } = open();
      expect(container).toBeEmptyDOMElement();
    });
  }
});

describe('when the list could not be read', () => {
  beforeEach(() => {
    signIn();
    store().setTenants([ALPHA, BETA]);
  });

  it('says so, rather than leaving an owner with no salon on the screen', async () => {
    serve('unreachable');
    await store().loadTenants();
    expect(store().tenantsStatus).toBe('error');

    open();
    expect(screen.getByText('We could not load your salons')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks again when told to', async () => {
    const user = userEvent.setup();
    serve('unreachable');
    await store().loadTenants();
    open();

    serve({ status: 200, body: [ALPHA, BETA] });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('radio', { name: /Aurora Salon/ })).toBeInTheDocument();
    expect(sent[0].url).toBe('http://api.test/api/tenants/mine/');
    expect(store().tenantsStatus).toBe('ready');
  });

  it('keeps showing the last list it had while the read is failing', async () => {
    serve('unreachable');
    await store().loadTenants();
    // `loadTenants` leaves the previous list alone on failure, which is what
    // the error copy promises.
    expect(store().tenants).toEqual([ALPHA, BETA]);
  });
});

describe('leaving a salon', () => {
  /** Opens the sheet and picks one, stopping at the confirm. */
  const askToRemove = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
    await user.click(screen.getByRole('button', { name: 'Remove a salon' }));
    await user.click(await screen.findByRole('button', { name }));
  };

  beforeEach(() => {
    signIn();
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);
  });

  it('says what survives before asking anything of the server', async () => {
    const user = userEvent.setup();
    serve(); // any request at all would throw
    open();

    await askToRemove(user, /Bluebell Parlour/);

    expect(screen.getByText('Remove Bluebell Parlour?')).toBeInTheDocument();
    expect(
      screen.getByText(/Your bookings and reviews there stay/),
    ).toBeInTheDocument();
    // Two taps in, and still nothing has been sent.
    expect(sent).toHaveLength(0);
  });

  it('removes a salon that was not the active one, and stays put', async () => {
    const user = userEvent.setup();
    serve({ status: 204 });
    open();

    await askToRemove(user, /Bluebell Parlour/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('DELETE');
    expect(sent[0].url).toBe(`http://api.test/api/tenants/mine/${BETA.id}/`);
    expect(store().tenants).toEqual([ALPHA]);
    // Untouched: it was not the salon in use.
    expect(store().activeTenantId).toBe(ALPHA.id);
    // Tidying is not a request to be taken anywhere.
    expect(screen.queryByText('the landing screen')).not.toBeInTheDocument();
  });

  it('settles on the one left when the active salon is the one removed', async () => {
    const user = userEvent.setup();
    serve({ status: 204 });
    open();

    await askToRemove(user, /Aurora Salon/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    // F1's reconcile, reached through setTenants — not a second rule written
    // here: gone, exactly one left, so that one is adopted.
    expect(store().tenants).toEqual([BETA]);
    expect(store().activeTenantId).toBe(BETA.id);
    expect(screen.queryByText('the landing screen')).not.toBeInTheDocument();
  });

  it('settles to nothing when the last salon goes, and the section disappears', async () => {
    const user = userEvent.setup();
    store().setTenants([ALPHA]);
    serve({ status: 204 });
    const { container } = open();

    await askToRemove(user, /Aurora Salon/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
    // Nothing left to list or leave, so the whole section goes — which is
    // clearer feedback than being moved to another screen.
    expect(container).toBeEmptyDOMElement();
  });

  it('refuses to guess when the active salon goes and several remain', async () => {
    const user = userEvent.setup();
    const gamma = { id: 6, slug: 'gamma', listingId: 'salon-6', name: 'Gamma Salon', avatar: '' };
    store().setTenants([ALPHA, BETA, gamma]);
    store().setActiveTenant(ALPHA.id);
    serve({ status: 204 });
    open();

    await askToRemove(user, /Aurora Salon/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(store().tenants).toEqual([BETA, gamma]);
    // Two left and no reason to prefer either: null, and no header goes out.
    expect(store().activeTenantId).toBeNull();
  });

  it('removes nothing when the confirm is dismissed', async () => {
    const user = userEvent.setup();
    serve(); // any request at all would throw
    open();

    await askToRemove(user, /Bluebell Parlour/);
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(sent).toHaveLength(0);
    expect(store().tenants).toEqual([ALPHA, BETA]);
    expect(store().activeTenantId).toBe(ALPHA.id);
  });

  it('leaves the list alone when the server refuses', async () => {
    const user = userEvent.setup();
    serve({ status: 500 });
    open();

    await askToRemove(user, /Bluebell Parlour/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    // The same rule loadTenants follows: a failed call keeps what was there.
    // A list that has quietly lost a row is worse than one briefly out of date.
    expect(store().tenants).toEqual([ALPHA, BETA]);
    expect(store().activeTenantId).toBe(ALPHA.id);
    expect(await screen.findByRole('radio', { name: /Bluebell Parlour/ })).toBeInTheDocument();
  });

  it('is not offered to an owner, who has no shop to leave', () => {
    useAppStore.setState(PRISTINE, true);
    store().setAuthStatus('ready');
    signIn('salon_owner');
    store().setTenants([ALPHA, BETA]);
    open();

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Remove a salon' })).not.toBeInTheDocument();
  });

  it('keeps no record that a salon was removed, so re-scanning works', async () => {
    const user = userEvent.setup();
    serve({ status: 204 });
    open();

    await askToRemove(user, /Bluebell Parlour/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(store().tenants).toEqual([ALPHA]);

    // The backend reactivates the same membership on a re-scan. Nothing local
    // may argue with that — a "removed, never show again" list would.
    store().setTenants([ALPHA, BETA]);
    expect(store().tenants).toEqual([ALPHA, BETA]);
    const persisted = JSON.parse(localStorage.getItem('eureka.app') ?? '{}');
    expect(JSON.stringify(persisted)).not.toMatch(/removed|dismissed|hidden/i);
  });
});
