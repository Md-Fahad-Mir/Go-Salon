/* The tenant slice of the session store.

   Ported from the manual harness written for Step F1, which drove the real
   store against a real backend and was thrown away afterwards. The behaviour
   it proved by hand is proved here on every run instead.

   The store itself is the thing under test — nothing is reimplemented or
   stubbed. Only localStorage is provided, by `src/test/setup.ts`. */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Tenant, User } from '../types';
import { STORAGE_KEYS } from '../constants';
import { sent, serve } from '../test/http';
import { useAppStore } from './useAppStore';

const ALPHA: Tenant = { id: 4, slug: 'alpha', listingId: 'salon-4', name: 'Alpha Salon', avatar: '' };
const BETA: Tenant = { id: 5, slug: 'beta', listingId: 'salon-5', name: 'Beta Salon', avatar: '' };
const GAMMA: Tenant = { id: 6, slug: 'gamma', listingId: 'barber-6', name: 'Gamma Salon', avatar: '' };

/** The wire shape of a tenant, for `serve()` bodies. The service maps
    `listing_id` to `listingId`, so a fixture sent as the app's own shape
    would arrive with an undefined listing and fail for the wrong reason. */
const wire = (t: Tenant) => ({
  id: t.id,
  slug: t.slug,
  listing_id: t.listingId,
  name: t.name,
  avatar: t.avatar,
});


const someone = (id = 'U1', role: User['role'] = 'customer'): User => ({
  id,
  role,
  name: 'Test Person',
  phone: '+8801955000009',
  createdAt: '2026-01-01T00:00:00.000Z',
  credits: 3,
});

/* Zustand stores are singletons, so each test puts this one back as it found
   it. Captured before any test has run, actions included, which is why the
   `true` (replace) flag is safe. */
const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
});

describe('a fresh store', () => {
  it('starts with no salons and no active one', () => {
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
  });
});

describe('setTenants: settling the active salon against the list', () => {
  it('keeps the active salon when it is still in the list', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    store().setTenants([ALPHA, BETA, GAMMA]);
    expect(store().activeTenantId).toBe(BETA.id);
  });

  it('adopts the only salon when exactly one arrives', () => {
    store().setTenants([ALPHA]);
    expect(store().activeTenantId).toBe(ALPHA.id);
  });

  it('makes no guess when several arrive and none was chosen', () => {
    store().setTenants([ALPHA, BETA]);
    expect(store().tenants).toHaveLength(2);
    expect(store().activeTenantId).toBeNull();
  });

  it('falls back to the only one left when the active membership goes', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    store().setTenants([ALPHA]);
    expect(store().activeTenantId).toBe(ALPHA.id);
  });

  it('refuses to guess when the active one goes and several remain', () => {
    store().setTenants([ALPHA, BETA, GAMMA]);
    store().setActiveTenant(ALPHA.id);
    store().setTenants([BETA, GAMMA]);
    expect(store().activeTenantId).toBeNull();
  });

  it('drops to null when every membership goes', () => {
    store().setTenants([ALPHA]);
    expect(store().activeTenantId).toBe(ALPHA.id);
    store().setTenants([]);
    expect(store().activeTenantId).toBeNull();
  });
});

describe('setActiveTenant', () => {
  it('switches to a salon in the list', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    expect(store().activeTenantId).toBe(BETA.id);
  });

  it('refuses an id the account does not belong to, rather than storing it', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(424242);
    expect(store().activeTenantId).toBeNull();
  });

  it('does not disturb the current choice when handed an unknown id', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);
    store().setActiveTenant(424242);
    expect(store().activeTenantId).toBe(ALPHA.id);
  });

  it('accepts null, which is how no header gets sent', () => {
    store().setTenants([ALPHA]);
    store().setActiveTenant(null);
    expect(store().activeTenantId).toBeNull();
  });
});

describe('activeTenant()', () => {
  it('gives back the whole record, for a screen that wants its name', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    expect(store().activeTenant()).toEqual(BETA);
  });

  it('is null when no salon is active', () => {
    store().setTenants([ALPHA, BETA]);
    expect(store().activeTenant()).toBeNull();
  });
});

describe('the session lifecycle', () => {
  it('starts a new sign-in with no tenancy at all', () => {
    store().setTenants([ALPHA]);
    store().setSession({ user: someone(), access: 'a', refresh: 'r' });
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
  });

  it('does not carry one account\'s salon over to the next', () => {
    store().setSession({ user: someone('U1'), access: 'a', refresh: 'r' });
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);
    store().clearSession();
    store().setSession({ user: someone('U2'), access: 'a2', refresh: 'r2' });
    expect(store().activeTenantId).toBeNull();
    expect(store().tenants).toEqual([]);
  });

  it('drops the tenancy on sign-out', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);
    store().clearSession();
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
  });
});

describe('persistence', () => {
  const persisted = () =>
    JSON.parse(localStorage.getItem(STORAGE_KEYS.app) ?? '{}').state as {
      tenants?: Tenant[];
      activeTenantId?: number | null;
    };

  it('writes both the list and the choice to localStorage', () => {
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    expect(persisted().tenants).toEqual([ALPHA, BETA]);
    expect(persisted().activeTenantId).toBe(BETA.id);
  });

  it('keeps a persisted choice that is still a membership', async () => {
    localStorage.setItem(
      STORAGE_KEYS.app,
      JSON.stringify({ state: { tenants: [ALPHA, BETA], activeTenantId: BETA.id }, version: 1 }),
    );
    await useAppStore.persist.rehydrate();
    expect(store().activeTenantId).toBe(BETA.id);
  });

  it('re-settles a persisted choice that is no longer a membership', async () => {
    // The salon was left on another device between one visit and the next.
    localStorage.setItem(
      STORAGE_KEYS.app,
      JSON.stringify({ state: { tenants: [ALPHA], activeTenantId: BETA.id }, version: 1 }),
    );
    await useAppStore.persist.rehydrate();
    expect(store().activeTenantId).toBe(ALPHA.id);
  });

  it('never restores a stale id when there is nothing to fall back to', async () => {
    localStorage.setItem(
      STORAGE_KEYS.app,
      JSON.stringify({ state: { tenants: [ALPHA, BETA], activeTenantId: 999999 }, version: 1 }),
    );
    await useAppStore.persist.rehydrate();
    expect(store().activeTenantId).toBeNull();
  });

  it('survives a stored blob written before tenancy existed', async () => {
    localStorage.setItem(
      STORAGE_KEYS.app,
      JSON.stringify({ state: { hasSeenWelcome: true }, version: 1 }),
    );
    await useAppStore.persist.rehydrate();
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
  });
});

describe('loadTenants: reading the list from the server', () => {
  /** Signed in, with nothing fetched yet. `setSession` clears the tenancy,
      so this is the state a fresh sign-in leaves behind. */
  const signIn = (role: User['role'] = 'customer') =>
    store().setSession({ user: someone('U1', role), access: 'a', refresh: 'r' });

  it('asks the right endpoint and stores what comes back', async () => {
    signIn();
    serve({ status: 200, body: [wire(ALPHA), wire(BETA)] });
    await store().loadTenants();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('http://api.test/api/tenants/mine/');
    expect(sent[0].method).toBe('GET');
    expect(store().tenants).toEqual([ALPHA, BETA]);
    expect(store().tenantsStatus).toBe('ready');
  });

  it('settles the active salon against what came back', async () => {
    signIn();
    // A stale choice, as a reload from localStorage would leave one.
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    serve({ status: 200, body: [wire(ALPHA)] });
    await store().loadTenants();
    // BETA is gone and ALPHA is the only one left, so ALPHA it is.
    expect(store().activeTenantId).toBe(ALPHA.id);
  });

  it('adopts the sole salon a one-salon customer gets back', async () => {
    signIn();
    serve({ status: 200, body: [wire(GAMMA)] });
    await store().loadTenants();
    expect(store().activeTenantId).toBe(GAMMA.id);
  });

  it('leaves a brand-new customer with an empty list and no active salon', async () => {
    signIn();
    serve({ status: 200, body: [] });
    await store().loadTenants();
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
    expect(store().tenantsStatus).toBe('ready');
  });

  it('keeps the previous list when the server cannot be reached', async () => {
    signIn();
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(ALPHA.id);
    serve('unreachable');
    await store().loadTenants();
    expect(store().tenants).toEqual([ALPHA, BETA]);
    expect(store().activeTenantId).toBe(ALPHA.id);
    expect(store().tenantsStatus).toBe('error');
  });

  it('loads normally when a mid-flight 401 is recovered by a refresh', async () => {
    signIn();
    serve(
      { status: 401, body: { detail: 'expired', code: 'token_not_valid', errors: {} } },
      { status: 200, body: { access: 'access-2' } },
      { status: 200, body: [wire(ALPHA), wire(BETA)] },
    );
    await store().loadTenants();
    expect(store().tenants).toEqual([ALPHA, BETA]);
    expect(store().tenantsStatus).toBe('ready');
  });

  it('lets the tenancy go when the session itself is gone', async () => {
    signIn();
    store().setTenants([ALPHA]);
    // 401, and the refresh token is refused too: there is no session left.
    serve(
      { status: 401, body: { detail: 'expired', code: 'token_not_valid', errors: {} } },
      { status: 401, body: { detail: 'no', code: 'token_not_valid', errors: {} } },
    );
    await store().loadTenants();
    // Not a half-update — `clearSession` ran, so this is a complete signed-out
    // state. What matters is that no stale salon is left to put on a header.
    expect(store().isAuthenticated).toBe(false);
    expect(store().tenants).toEqual([]);
    expect(store().activeTenantId).toBeNull();
    expect(store().tenantsStatus).toBe('error');
  });

  it('keeps the previous list when the body is not a list at all', async () => {
    signIn();
    store().setTenants([ALPHA, BETA]);
    serve({ status: 200, body: { detail: 'something unexpected' } });
    await store().loadTenants();
    expect(store().tenants).toEqual([ALPHA, BETA]);
    expect(store().tenantsStatus).toBe('error');
  });

  it('never leaves the list half-updated', async () => {
    signIn();
    store().setTenants([ALPHA, BETA]);
    store().setActiveTenant(BETA.id);
    const before = { tenants: store().tenants, active: store().activeTenantId };
    serve({ status: 500 });
    await store().loadTenants();
    expect(store().tenants).toBe(before.tenants);
    expect(store().activeTenantId).toBe(before.active);
  });

  describe('which list each role is asked for', () => {
    it('asks a customer for the salons they have joined', async () => {
      signIn('customer');
      serve({ status: 200, body: [wire(ALPHA)] });
      await store().loadTenants();
      expect(sent[0].url).toBe('http://api.test/api/tenants/mine/');
    });

    it('asks an owner for the salons they own, not for memberships', async () => {
      // `/tenants/mine/` would answer an owner 403 `not_a_customer`; owning a
      // shop is not joining one, and only owners can have several.
      signIn('salon_owner');
      serve({ status: 200, body: [wire(ALPHA), wire(BETA)] });
      await store().loadTenants();
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe('http://api.test/api/tenants/owned/');
      expect(store().tenants).toEqual([ALPHA, BETA]);
    });

    // A barber's profile is one-to-one with their account and a stylist's
    // active employment is bounded by a partial unique index, so each has at
    // most one tenant and the backend resolves it from the account. There is
    // no list, and no endpoint that would answer.
    for (const role of ['barber', 'salon_employee', 'admin'] as const) {
      it(`asks nothing at all for a ${role}`, async () => {
        signIn(role);
        serve(); // any request at all would throw
        await store().loadTenants();
        expect(sent).toHaveLength(0);
        expect(store().tenants).toEqual([]);
        expect(store().activeTenantId).toBeNull();
        expect(store().tenantsStatus).toBe('ready');
      });
    }

    it('treats a session stored before roles existed as a customer', async () => {
      store().setSession({ user: { ...someone(), role: undefined }, access: 'a', refresh: 'r' });
      serve({ status: 200, body: [wire(ALPHA)] });
      await store().loadTenants();
      expect(sent).toHaveLength(1);
      expect(store().tenants).toEqual([ALPHA]);
    });
  });

  it('asks nothing at all when nobody is signed in', async () => {
    serve();
    await store().loadTenants();
    expect(sent).toHaveLength(0);
    expect(store().tenantsStatus).toBe('idle');
  });
});
