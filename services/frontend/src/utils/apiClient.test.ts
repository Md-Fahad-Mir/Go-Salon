/* The HTTP client: what it puts on a request, and what it throws back.

   Ported from the manual harness written for Step F1. That harness drove this
   same client against a running Django server; these drive it against a fake
   `fetch` carrying the exact envelopes that server was observed to send —
   captured from `Apps/tenants/permissions.py` and rendered by
   `Apps/users/exceptions.py` as `{detail, code, errors}`.

   Only the network is faked. The client and the store are the real ones. */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Tenant, User } from '../types';
import { lastRequest, sent, serve } from '../test/http';
import { useAppStore } from '../store/useAppStore';
import { ApiValidationError, api, isTenantError, requestBlob, TenantError } from './apiClient';

const ALPHA: Tenant = { id: 4, slug: 'alpha', listingId: 'salon-4', name: 'Alpha Salon', avatar: '' };
const BETA: Tenant = { id: 5, slug: 'beta', listingId: 'salon-5', name: 'Beta Salon', avatar: '' };

const someone = (): User => ({
  id: 'U1',
  name: 'Test Person',
  phone: '+8801955000009',
  createdAt: '2026-01-01T00:00:00.000Z',
  credits: 3,
});

/* The refusals, exactly as the backend was observed to render them. */
const TENANT_REQUIRED = {
  status: 400,
  body: {
    detail: 'Say which salon this request is about.',
    code: 'tenant_required',
    errors: { 'X-Tenant-Id': ['Say which salon this request is about.'] },
  },
};
const TENANT_NOT_FOUND = {
  status: 404,
  body: { detail: 'No such salon.', code: 'tenant_not_found', errors: {} },
};
const NOT_A_MEMBER = {
  status: 403,
  body: { detail: 'You do not have access to that salon.', code: 'not_a_member', errors: {} },
};
const ROLE_REFUSAL = {
  status: 403,
  body: { detail: 'Only a professional account can do that.', code: 'permission_denied', errors: {} },
};
const ORDINARY_404 = {
  status: 404,
  body: { detail: 'No such service.', code: 'not_found', errors: {} },
};

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

/** Signed in, belonging to two salons, none chosen — the state F2's switcher
    exists to resolve, and the one most of these start from. */
function signedIn(tenants: Tenant[] = [ALPHA, BETA]): void {
  store().setSession({ user: someone(), access: 'access-1', refresh: 'refresh-1' });
  store().setTenants(tenants);
}

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  sent.length = 0;
});

const last = () => lastRequest()!;

describe('the tenant header', () => {
  it('is left off entirely when no salon is chosen', async () => {
    signedIn();
    serve({ status: 200, body: { viewpoint: 'customer', results: [] } });
    await api.get('/bookings/');
    expect(last().headers).not.toHaveProperty('X-Tenant-Id');
    expect(last().headers.Authorization).toBe('Bearer access-1');
  });

  it('carries the active salon once one is chosen', async () => {
    signedIn();
    store().setActiveTenant(ALPHA.id);
    serve({ status: 200, body: { viewpoint: 'customer', results: [] } });
    await api.get('/bookings/');
    expect(last().headers['X-Tenant-Id']).toBe('4');
  });

  it('is a string, never the number and never "null"', async () => {
    signedIn([ALPHA]);
    serve({ status: 200, body: {} });
    await api.get('/bookings/');
    expect(last().headers['X-Tenant-Id']).toBe('4');
    expect(Object.values(last().headers)).not.toContain('null');
  });

  it('never goes out on an anonymous call, even with a salon chosen', async () => {
    signedIn([ALPHA]);
    serve({ status: 200, body: { access: 'a', refresh: 'r' } });
    await api.post('/auth/login/', { phone: '+8801955000009' }, { anonymous: true });
    expect(last().headers).not.toHaveProperty('X-Tenant-Id');
    expect(last().headers).not.toHaveProperty('Authorization');
  });

  it('is re-read for the replay after a token refresh', async () => {
    signedIn([ALPHA]);
    serve(
      { status: 401, body: { detail: 'expired', code: 'token_not_valid', errors: {} } },
      { status: 200, body: { access: 'access-2' } },
      { status: 200, body: { viewpoint: 'customer', results: [] } },
    );
    await api.get('/bookings/');
    expect(sent).toHaveLength(3);
    // The refresh call is its own thing and names no salon.
    expect(sent[1].url).toContain('/auth/token/refresh/');
    expect(sent[1].headers).not.toHaveProperty('X-Tenant-Id');
    // The replay carries both the new token and the salon.
    expect(sent[2].headers.Authorization).toBe('Bearer access-2');
    expect(sent[2].headers['X-Tenant-Id']).toBe('4');
  });

  it('spends one refresh for several requests that expire together', async () => {
    signedIn([ALPHA]);
    const expired = { status: 401, body: { detail: 'expired', code: 'token_not_valid', errors: {} } };
    serve(
      expired,
      expired,
      { status: 200, body: { access: 'access-2' } },
      { status: 200, body: {} },
      { status: 200, body: {} },
    );
    await Promise.all([api.get('/bookings/'), api.get('/tenants/mine/')]);
    const refreshes = sent.filter((r) => r.url.includes('/auth/token/refresh/'));
    expect(refreshes).toHaveLength(1);
  });
});

describe('a call that works', () => {
  it('gives back the parsed body', async () => {
    signedIn([ALPHA]);
    serve({ status: 200, body: { viewpoint: 'customer', results: [{ id: 1 }] } });
    const page = await api.get<{ viewpoint: string; results: { id: number }[] }>('/bookings/');
    expect(page.viewpoint).toBe('customer');
    expect(page.results).toHaveLength(1);
  });

  it('gives back null for a 204', async () => {
    signedIn([ALPHA]);
    serve({ status: 204 });
    await expect(api.delete('/tenants/mine/4/')).resolves.toBeNull();
  });
});

describe('tenant refusals become TenantError', () => {
  it('400 tenant_required: several salons and none named', async () => {
    signedIn([ALPHA, BETA]);
    serve(TENANT_REQUIRED);
    const error = await api.get('/bookings/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(true);
    const tenantError = error as TenantError;
    expect(tenantError.reason).toBe('required');
    expect(tenantError.status).toBe(400);
    expect(tenantError.code).toBe('tenant_required');
    expect(tenantError.name).toBe('TenantError');
    // Nothing was sent, so there is no id to blame.
    expect(tenantError.tenantId).toBeNull();
    // The refusal still behaves like every other one this client throws.
    expect(tenantError).toBeInstanceOf(ApiValidationError);
    expect(tenantError.fieldError('X-Tenant-Id')).toBe('Say which salon this request is about.');
    expect(tenantError.message).toBe('Say which salon this request is about.');
  });

  it('404 tenant_not_found: unknown or deactivated', async () => {
    signedIn([{ id: 999999, slug: 'gone', listingId: 'salon-999999', name: 'Gone', avatar: '' }]);
    serve(TENANT_NOT_FOUND);
    const error = await api.get('/bookings/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(true);
    const tenantError = error as TenantError;
    expect(tenantError.reason).toBe('unknown');
    expect(tenantError.status).toBe(404);
    expect(tenantError.code).toBe('tenant_not_found');
    // Names the salon that was sent, so a caller can prune it from the list.
    expect(tenantError.tenantId).toBe(999999);
  });

  it('403 not_a_member: a real salon this account never joined', async () => {
    signedIn([ALPHA]);
    serve(NOT_A_MEMBER);
    const error = await api.get('/bookings/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(true);
    const tenantError = error as TenantError;
    expect(tenantError.reason).toBe('forbidden');
    expect(tenantError.status).toBe(403);
    expect(tenantError.code).toBe('not_a_member');
    expect(tenantError.tenantId).toBe(ALPHA.id);
  });
});

describe('ordinary refusals are left exactly as they were', () => {
  it('a role 403 is not a tenant problem', async () => {
    signedIn([ALPHA]);
    serve(ROLE_REFUSAL);
    const error = await api.get('/services/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(false);
    expect(error).toBeInstanceOf(ApiValidationError);
    expect((error as ApiValidationError).code).toBe('permission_denied');
    expect((error as ApiValidationError).status).toBe(403);
  });

  it('a missing row is not a missing salon', async () => {
    signedIn([ALPHA]);
    serve(ORDINARY_404);
    const error = await api.get('/services/999999/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(false);
    expect((error as ApiValidationError).code).toBe('not_found');
  });

  it('a 500 still reads as our fault', async () => {
    signedIn([ALPHA]);
    serve({ status: 500 });
    const error = await api.get('/bookings/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(false);
    expect((error as ApiValidationError).message).toMatch(/our end/);
  });

  it('an unreachable server is still a network error, not a tenant one', async () => {
    signedIn([ALPHA]);
    serve('unreachable');
    const error = await api.get('/bookings/').catch((e: unknown) => e);
    expect(isTenantError(error)).toBe(false);
    expect((error as ApiValidationError).code).toBe('network');
    expect((error as ApiValidationError).status).toBe(0);
  });
});

/* The header this sends is not cosmetic, and the obvious value is the wrong one.
   DRF settles `Accept` against the view's `renderer_classes` in
   `APIView.initial()` — before the handler runs, and knowing nothing about the
   raw `HttpResponse` that one writes. `SalonQRView` declares no renderers, so it
   has the project default of JSON; asking for `image/png` is refused with a 406
   before the image is drawn. This suite and the backend's both passed while the
   screen was broken in every browser, so the header itself is pinned here. */
describe('the QR code request', () => {
  const png = () =>
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

  it('asks for JSON, never for the image it is actually going to get', async () => {
    signedIn([ALPHA]);
    serve({ status: 200, blob: png() });
    await requestBlob('/salon/qr/');

    expect(last().headers.Accept).toBe('application/json');
  });

  it('hands back the PNG all the same', async () => {
    signedIn([ALPHA]);
    serve({ status: 200, blob: png() });
    const blob = await requestBlob('/salon/qr/');

    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('sends the same header when regenerating', async () => {
    signedIn([ALPHA]);
    serve({ status: 200, blob: png() });
    await requestBlob('/salon/qr/regenerate/', { method: 'POST' });

    expect(last().headers.Accept).toBe('application/json');
    expect(last().method).toBe('POST');
  });

  it('still reads a refusal as the JSON it is', async () => {
    signedIn([ALPHA]);
    serve({ status: 403, body: { detail: 'Not yours.', code: 'not_owner', errors: {} } });
    const error = await requestBlob('/salon/qr/').catch((e: unknown) => e);

    expect((error as ApiValidationError).code).toBe('not_owner');
    expect((error as ApiValidationError).status).toBe(403);
  });
});
