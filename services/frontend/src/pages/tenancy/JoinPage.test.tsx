/* The screen a salon's QR code opens.

   The component, the store, the api client and the service are all the real
   ones; only `fetch` is faked, by the same `serve()` the store and client
   suites use. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../components/LanguageProvider';
import { useAppStore } from '../../store/useAppStore';
import { sent, serve } from '../../test/http';
import { mount } from '../../test/render';
import type { User } from '../../types';
import JoinPage from './JoinPage';

const TOKEN = 'a'.repeat(43);
const SALON = {
  id: 4, slug: 'aurora-salon', listingId: 'salon-4', name: 'Aurora Salon', avatar: '',
};
/** What the server actually sends; the service maps it. */
const SALON_WIRE = {
  id: 4, slug: 'aurora-salon', listing_id: 'salon-4', name: 'Aurora Salon', avatar: '',
};

const someone = (role: User['role'] = 'customer'): User => ({
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
  // `authStatus` starts at 'restoring'; every test below is about what happens
  // once that question has been answered.
  store().setAuthStatus('ready');
});

const signIn = (role: User['role'] = 'customer') =>
  store().setSession({ user: someone(role), access: 'a', refresh: 'r' });

/** Mounts the join route, with a stand-in for wherever it might redirect. */
const open = (token = TOKEN) =>
  mount({
    at: `/join/${token}`,
    routes: { '/join/:token': <JoinPage /> },
    elsewhere: <p>somewhere else</p>,
  });

describe('a customer scanning a salon’s code', () => {
  it('opens the salon they just joined, which is now Home', async () => {
    signIn();
    serve({ status: 201, body: SALON_WIRE });
    mount({
      at: `/join/${TOKEN}`,
      routes: { '/join/:token': <JoinPage />, '/home': <p>the home screen</p> },
      elsewhere: <p>somewhere else</p>,
    });

    await screen.findByText('You’re in');
    // The join made this salon the active one, so Home *is* this salon —
    // its menu, its hours, and the button that books. Straight into the
    // wizard was right when Home was a list; it is one tap further now.
    const way = screen.getByRole('link', { name: 'Open the salon' });
    expect(way).toHaveAttribute('href', '/home');
    await userEvent.click(way);
    expect(screen.getByText('the home screen')).toBeInTheDocument();
  });

  it('joins, says so by name, and makes that salon the active one', async () => {
    signIn();
    serve({ status: 201, body: SALON_WIRE });
    open();

    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    expect(screen.getByText(/Aurora Salon is on your list/)).toBeInTheDocument();
    expect(store().tenants).toEqual([SALON]);
    expect(store().activeTenantId).toBe(SALON.id);
  });

  it('sends the token from the URL to the join endpoint', async () => {
    signIn();
    serve({ status: 201, body: SALON_WIRE });
    open();

    await screen.findByText('You’re in');
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('http://api.test/api/tenants/join/');
    expect(sent[0].method).toBe('POST');
  });

  it('treats a re-scan (200, already a member) exactly like a first scan', async () => {
    signIn();
    serve({ status: 200, body: SALON_WIRE });
    open();

    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    expect(store().activeTenantId).toBe(SALON.id);
  });

  it('shows a spinner while the join is in flight', () => {
    signIn();
    serve({ status: 201, body: SALON_WIRE });
    open();

    expect(screen.getByRole('status')).toHaveAccessibleName('Adding you to the salon');
  });

  it('switches the active salon to the one just scanned', async () => {
    signIn();
    const other = { id: 9, slug: 'other', listingId: 'salon-9', name: 'Other Salon', avatar: '' };
    store().setTenants([other]);
    expect(store().activeTenantId).toBe(other.id);

    serve({ status: 201, body: SALON_WIRE });
    open();

    await screen.findByText('You’re in');
    expect(store().activeTenantId).toBe(SALON.id);
    expect(store().tenants.map((s) => s.id).sort()).toEqual([4, 9]);
  });

  it('asks once, not twice, when React double-invokes the effect', async () => {
    signIn();
    serve({ status: 201, body: SALON_WIRE });
    render(
      <StrictMode>
        <LanguageProvider>
          <MemoryRouter initialEntries={[`/join/${TOKEN}`]}>
            <Routes>
              <Route path="/join/:token" element={<JoinPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </StrictMode>,
    );

    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });
});

describe('a code that is not good any more', () => {
  it('says the code is invalid rather than showing a raw failure', async () => {
    signIn();
    serve({
      status: 404,
      body: { detail: 'That code is not valid any more.', code: 'not_found', errors: {} },
    });
    open();

    expect(await screen.findByText('That code is not valid')).toBeInTheDocument();
    expect(screen.getByText(/Ask at the counter/)).toBeInTheDocument();
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
    // Back to where the scanner is opened from — not to a Home that, with no
    // salon joined, would only say to go and scan one.
    expect(screen.getByRole('link', { name: 'Back to Settings' }))
      .toHaveAttribute('href', '/profile/settings');
  });

  it('leaves no dead code in the history for Back to send again', async () => {
    signIn();
    serve({
      status: 404,
      body: { detail: 'That code is not valid any more.', code: 'not_found', errors: {} },
    });
    /** Settings, with a Back that pops history the way the real header does. */
    function Settings() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>back from settings</button>;
    }
    // Where the scanner leaves things: it replaces itself with the join screen,
    // so Settings is directly underneath.
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/profile/settings', `/join/${TOKEN}`]} initialIndex={1}>
          <Routes>
            <Route path="/join/:token" element={<JoinPage />} />
            <Route path="/profile/settings" element={<Settings />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );

    await screen.findByText('That code is not valid');
    await userEvent.click(screen.getByRole('link', { name: 'Back to Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'back from settings' }));

    // Pushed rather than replaced, Back would remount the join screen, which
    // forgets its request and POSTs the dead token again.
    expect(screen.queryByText('That code is not valid')).not.toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it('offers a retry for a failure that might not repeat', async () => {
    signIn();
    serve('unreachable');
    open();

    expect(await screen.findByText('We could not load that')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('an account that cannot join a salon', () => {
  for (const role of ['salon_owner', 'barber', 'salon_employee'] as const) {
    it(`tells a ${role} why, without asking the server`, async () => {
      signIn(role);
      serve(); // any request at all would throw
      open();

      expect(
        await screen.findByText('This account cannot join a salon'),
      ).toBeInTheDocument();
      // The real proof: the round trip never happened. The backend would have
      // answered 403 `not_a_customer`, and learning that from the role is
      // both faster and the same answer.
      expect(sent).toHaveLength(0);
      expect(store().tenants).toEqual([]);
    });
  }
});

describe('nobody signed in yet', () => {
  it('goes to sign-in rather than to the join', () => {
    serve();
    mount({
      at: `/join/${TOKEN}`,
      routes: { '/join/:token': <JoinPage />, '/auth/login': <p>the sign-in screen</p> },
    });

    expect(screen.getByText('the sign-in screen')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('remembers the code so the journey can be finished afterwards', () => {
    serve();
    mount({
      at: `/join/${TOKEN}`,
      routes: { '/join/:token': <JoinPage />, '/auth/login': <p>the sign-in screen</p> },
    });

    expect(store().pendingRedirect).toBe(`/join/${TOKEN}`);
  });

  it('holds instead of redirecting while the stored session is still being checked', () => {
    store().setAuthStatus('restoring');
    serve();
    mount({
      at: `/join/${TOKEN}`,
      routes: { '/join/:token': <JoinPage />, '/auth/login': <p>the sign-in screen</p> },
    });

    // Redirecting here would sign somebody out for a moment and then change
    // its mind once `me()` came back.
    expect(screen.queryByText('the sign-in screen')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(store().pendingRedirect).toBeNull();
  });
});
