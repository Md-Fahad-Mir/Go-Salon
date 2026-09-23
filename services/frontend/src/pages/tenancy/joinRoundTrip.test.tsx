/* Scanning a salon's code without being signed in, and getting back.

   The reason this exists: the journey from a scanned code to a joined salon
   runs through screens that each drop React Router's `location.state`, and a
   QR scan is a cold page load with no state to begin with. The only proof
   that it works is to walk it — with the real JoinPage, the real LoginPage,
   the real store and the real api client, and nothing faked but `fetch`. */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import LoginPage from '../auth/LoginPage';
import { useAppStore } from '../../store/useAppStore';
import { requestsTo, route, sent } from '../../test/http';
import { mount } from '../../test/render';
import JoinPage from './JoinPage';

const TOKEN = 'a'.repeat(43);
const SALON = { id: 4, slug: 'aurora-salon', name: 'Aurora Salon', avatar: '' };

const SESSION = {
  user: {
    id: 'U1',
    name: 'Test Person',
    role: 'customer',
    phone: '+8801955000009',
    createdAt: '2026-01-01T00:00:00.000Z',
    credits: 3,
  },
  access: 'access-1',
  refresh: 'refresh-1',
};

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
});

/** The three screens this journey can touch. */
const walk = (at: string) =>
  mount({
    at,
    routes: {
      '/join/:token': <JoinPage />,
      '/auth/login': <LoginPage />,
      '/home': <p>the home screen</p>,
    },
  });

describe('scanning a salon’s code with no session', () => {
  it('signs in and comes back to finish the join, not to the home screen', async () => {
    const user = userEvent.setup();
    /* By URL, not in order: signing in also kicks off a fire-and-forget read
       of the salon list (`useAuth.accept` -> `loadTenants`), so the join and
       that read are in flight together with no fixed sequence between them. */
    route([
      ['/auth/login/', { status: 200, body: SESSION }],
      ['/tenants/mine/', { status: 200, body: [] }],
      ['/tenants/join/', { status: 201, body: SALON }],
    ]);

    walk(`/join/${TOKEN}`);

    // Bounced to sign-in, with the code kept somewhere that outlives the trip.
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument();
    expect(store().pendingRedirect).toBe(`/join/${TOKEN}`);

    await user.type(screen.getByLabelText('Mobile number'), '1955000009');
    await user.type(screen.getByLabelText('Password'), 'chairside2026');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Back on the join screen and finished — NOT on /home.
    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    expect(screen.queryByText('the home screen')).not.toBeInTheDocument();
    expect(store().activeTenantId).toBe(SALON.id);

    // Signed in once, joined once, and the join happened after the sign-in.
    expect(requestsTo('/auth/login/')).toHaveLength(1);
    expect(requestsTo('/tenants/join/')).toHaveLength(1);
    expect(sent[0].url).toContain('/auth/login/');
  });

  it('clears the remembered code once it has been used', async () => {
    const user = userEvent.setup();
    route([
      ['/auth/login/', { status: 200, body: SESSION }],
      ['/tenants/mine/', { status: 200, body: [] }],
      ['/tenants/join/', { status: 201, body: SALON }],
    ]);

    walk(`/join/${TOKEN}`);
    await screen.findByLabelText('Mobile number');

    await user.type(screen.getByLabelText('Mobile number'), '1955000009');
    await user.type(screen.getByLabelText('Password'), 'chairside2026');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByText('You’re in');
    // A destination left in storage would hijack the next sign-in on a shared
    // phone, which is exactly what the logout path already guards against.
    expect(store().pendingRedirect).toBeNull();
  });

  it('sends someone who signed in without scanning to their own home screen', async () => {
    const user = userEvent.setup();
    route([
      ['/auth/login/', { status: 200, body: SESSION }],
      ['/tenants/mine/', { status: 200, body: [] }],
    ]);

    walk('/auth/login');
    await screen.findByLabelText('Mobile number');

    await user.type(screen.getByLabelText('Mobile number'), '1955000009');
    await user.type(screen.getByLabelText('Password'), 'chairside2026');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('the home screen')).toBeInTheDocument();
  });

  it('forgets the code when the session is dropped instead of completed', async () => {
    route([]);
    walk(`/join/${TOKEN}`);
    await waitFor(() => expect(store().pendingRedirect).toBe(`/join/${TOKEN}`));

    store().clearSession();
    expect(store().pendingRedirect).toBeNull();
  });
});
