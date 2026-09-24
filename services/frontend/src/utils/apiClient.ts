/* The HTTP client every authenticated call goes through.

   It does three things no call site should have to: points at the API, puts
   the access token on the request, and deals with that token expiring. A 401
   spends the refresh token once — one refresh at a time, however many requests
   are waiting — and replays what failed.

   A refusal and an unreachable server are kept apart. Only a server that has
   looked at the refresh token and said no clears the session; a call that
   never arrived leaves it exactly where it was, because signing somebody out
   is not a reasonable answer to a dropped connection. */

import { useAppStore } from '../store/useAppStore';
import { ApiError } from './apiError';

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send without the Authorization header: sign-in, sign-up, reset. */
  anonymous?: boolean;
  signal?: AbortSignal;
  /** What the caller will accept back. Defaults to JSON, which is what every
      endpoint but the QR code answers with. */
  accept?: string;
}

interface ApiErrorBody {
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  retry_after?: number;
}

/** A failed call, carrying what the form needs to point at the right field. */
export class ApiValidationError extends ApiError {
  errors: Record<string, string[]>;
  retryAfter?: number;
  /** The whole response body.

      Some refusals carry more than a message: being past a cancellation
      deadline comes back with the salon's name and number so the screen has
      something to dial. Keeping the body means a new one of those needs no
      change here. */
  body: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    errors: Record<string, string[]> = {},
    retryAfter?: number,
    body: Record<string, unknown> = {},
  ) {
    super(code, message, status);
    this.errors = errors;
    this.retryAfter = retryAfter;
    this.body = body;
    this.name = 'ApiValidationError';
  }

  /** The message for one field, if the server blamed it. */
  fieldError(field: string): string | undefined {
    return this.errors[field]?.[0];
  }

  /** A top-level value the server attached to the refusal. */
  detailOf(key: string): string | undefined {
    const value = this.body[key];
    return typeof value === 'string' ? value : undefined;
  }
}

/* --------------------------------------------------------------------------
   Tenant refusals.

   Three of them, and they are not interchangeable — nor are they the same as
   the ordinary refusal each one shares a status code with. The backend gives
   every one its own `code`, which is what these match on; matching on the
   status alone would sweep up a role refusal and a missing row as well.

     400 tenant_required   several salons, and the request named none. Nothing
                           to resolve, so the backend refuses to guess.
     404 tenant_not_found  unknown OR deactivated, deliberately not told apart
                           so nobody can enumerate which salons exist.
     403 not_a_member      a real salon this account does not belong to. Never
                           silently swapped for one it does.

   Matched against the live API, not inferred: `Apps/tenants/permissions.py`
   raises them and `Apps/users/exceptions.py` renders every one as
   `{detail, code, errors}`.
   -------------------------------------------------------------------------- */

/** Which of the three. `required` is a question to put to the person; the
    other two mean the tenant we sent is not one we may use. */
export type TenantErrorReason = 'required' | 'unknown' | 'forbidden';

const TENANT_ERROR_CODES: Record<string, TenantErrorReason> = {
  tenant_required: 'required',
  tenant_not_found: 'unknown',
  not_a_member: 'forbidden',
};

/** A refusal about *which salon*, as opposed to who is asking or what they
    are allowed to do.

    Extends `ApiValidationError` rather than replacing it so that every
    existing `catch` keeps working untouched — code that only knows about
    `ApiValidationError` still catches this, reads the same `code`, `detail`
    and `status`, and behaves exactly as it did. Only code that asks for the
    distinction sees one. */
export class TenantError extends ApiValidationError {
  reason: TenantErrorReason;
  /** The tenant id that was on the request, so a caller can drop it from the
      list it no longer belongs in. Null for `required`, where the whole
      complaint is that nothing was sent. */
  tenantId: number | null;

  constructor(
    reason: TenantErrorReason,
    tenantId: number | null,
    code: string,
    message: string,
    status: number,
    errors: Record<string, string[]> = {},
    body: Record<string, unknown> = {},
  ) {
    super(code, message, status, errors, undefined, body);
    this.reason = reason;
    this.tenantId = tenantId;
    this.name = 'TenantError';
  }
}

export const isTenantError = (error: unknown): error is TenantError => error instanceof TenantError;

const isJson = (response: Response): boolean =>
  (response.headers.get('content-type') ?? '').includes('application/json');

async function parse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  if (!isJson(response)) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toError(response: Response, body: unknown): ApiValidationError {
  const payload = (body ?? {}) as ApiErrorBody;

  const reason = payload.code ? TENANT_ERROR_CODES[payload.code] : undefined;
  if (reason) {
    return new TenantError(
      reason,
      reason === 'required' ? null : useAppStore.getState().activeTenantId,
      payload.code as string,
      payload.detail ?? 'That salon is not available to you.',
      response.status,
      payload.errors ?? {},
      (body ?? {}) as Record<string, unknown>,
    );
  }

  const fallback =
    response.status >= 500
      ? 'Something went wrong at our end. Try again in a moment.'
      : 'That did not work.';
  return new ApiValidationError(
    payload.code ?? `http_${response.status}`,
    payload.detail ?? fallback,
    response.status,
    payload.errors ?? {},
    payload.retry_after,
    (body ?? {}) as Record<string, unknown>,
  );
}

/* One refresh at a time. Three requests failing together must not spend three
   refresh tokens — rotation would blacklist the two that lost the race. */
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, clearSession } = useAppStore.getState();
  if (!refreshToken) return null;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
  } catch {
    // Could not reach the server at all. That says nothing about whether this
    // token is still good, so the session is left alone and the next call
    // tries again — a dropped connection is not grounds for signing somebody
    // out mid-shift, and the live booking feed makes brief outages ordinary.
    return null;
  }

  if (!response.ok) {
    // The server looked at the token and refused it: expired, blacklisted, or
    // already spent by a rotation. There is no session left to save, so drop
    // it and let the route guards do the rest.
    clearSession();
    return null;
  }

  try {
    const data = (await response.json()) as { access: string; refresh?: string };
    setTokens(data.access, data.refresh ?? refreshToken);
    return data.access;
  } catch {
    // A 200 that is not a token is a broken session either way.
    clearSession();
    return null;
  }
}

function withRefresh(): Promise<string | null> {
  inFlightRefresh ??= refreshAccessToken().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: options.accept ?? 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  /* Which salon this is about, beside the token that says who is asking.

     Sent only when there is one. An absent header is a meaningful answer to
     the backend — use my only salon, or, for an account with none, carry on
     without one — whereas `X-Tenant-Id: null` is an id for a salon that does
     not exist and comes back 404. Omitted on anonymous calls too: sign-in and
     sign-up happen before there is a membership to name.

     Read here rather than passed in, so it is impossible for a call site to
     forget, and re-read on the replay after a token refresh. */
  if (!options.anonymous) {
    const tenantId = useAppStore.getState().activeTenantId;
    if (tenantId !== null) headers['X-Tenant-Id'] = String(tenantId);
  }

  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

/** The half every caller shares: the token on the request, one refresh if it
    has expired, and the replay. What comes back is still a raw `Response`,
    because what to do with the body depends on what was asked for. */
async function exchange(path: string, options: RequestOptions): Promise<Response> {
  const token = options.anonymous ? null : useAppStore.getState().accessToken;

  let response: Response;
  try {
    response = await send(path, options, token);
  } catch {
    throw new ApiValidationError('network', 'No connection. Check your internet and try again.', 0);
  }

  // Expired access token: refresh once and replay. Anonymous calls and the
  // refresh call itself never come through here, so there is no loop.
  if (response.status === 401 && !options.anonymous && token) {
    const fresh = await withRefresh();
    if (fresh) {
      try {
        response = await send(path, options, fresh);
      } catch {
        throw new ApiValidationError('network', 'No connection. Check your internet and try again.', 0);
      }
    }
  }

  return response;
}

/** Make a call. Resolves with the parsed body, throws `ApiValidationError`. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await exchange(path, options);
  const body = await parse(response);
  if (!response.ok) throw toError(response, body);
  return body as T;
}

/** Fetch binary. One endpoint needs this — the salon's QR code, which answers
    with a PNG — and it is worth saying why it is not simply `request`.

    A refusal from that endpoint is still JSON. `TenantContext` and `OwnsTenant`
    raise DRF exceptions, which `Apps/users/exceptions.py` renders as
    `{detail, code, errors}` like every other refusal in the API, so the whole
    typed-error path above applies unchanged to the failure case. It is only
    *success* that is not JSON. Parsing the body by status rather than by
    endpoint is what lets a 403 here still arrive as a `TenantError`.

    A 200 that is not an image is treated as a failure rather than handed back:
    a proxy's sign-in page or an HTML error wrapper would otherwise reach an
    `<img>` as a blob and render as a broken icon with nothing to explain it. */
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await exchange(path, { ...options, accept: options.accept ?? 'image/png' });

  if (!response.ok) {
    throw toError(response, await parse(response));
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new ApiValidationError(
      'not_an_image',
      'That did not come back as an image.',
      response.status,
    );
  }
  return blob;
}

export const api = {
  get: <T>(path: string, options: RequestOptions = {}) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { BASE_URL };
