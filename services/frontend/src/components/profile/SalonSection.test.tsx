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

const ALPHA: Tenant = { id: 4, slug: 'alpha', name: 'Aurora Salon', avatar: '' };
const BETA: Tenant = { id: 5, slug: 'beta', name: 'Bluebell Parlour', avatar: '' };

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
  it('renders nothing for a customer who has joined one salon', () => {
    signIn();
    store().setTenants([ALPHA]);
    const { container } = open();

    // One salon is not a choice — the backend resolves a sole tenant from the
    // account anyway, so a picker here could not change anything.
    expect(container).toBeEmptyDOMElement();
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
