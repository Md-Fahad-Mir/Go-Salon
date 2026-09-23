/* The tenant slice of the session store.

   Ported from the manual harness written for Step F1, which drove the real
   store against a real backend and was thrown away afterwards. The behaviour
   it proved by hand is proved here on every run instead.

   The store itself is the thing under test — nothing is reimplemented or
   stubbed. Only localStorage is provided, by `src/test/setup.ts`. */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Tenant, User } from '../types';
import { STORAGE_KEYS } from '../constants';
import { useAppStore } from './useAppStore';

const ALPHA: Tenant = { id: 4, slug: 'alpha', name: 'Alpha Salon', avatar: '' };
const BETA: Tenant = { id: 5, slug: 'beta', name: 'Beta Salon', avatar: '' };
const GAMMA: Tenant = { id: 6, slug: 'gamma', name: 'Gamma Salon', avatar: '' };

const someone = (id = 'U1'): User => ({
  id,
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
