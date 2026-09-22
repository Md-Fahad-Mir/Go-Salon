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
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

/** Make a call. Resolves with the parsed body, throws `ApiValidationError`. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

  const body = await parse(response);
  if (!response.ok) throw toError(response, body);
  return body as T;
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
