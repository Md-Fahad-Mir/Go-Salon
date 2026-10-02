/* The HTTP client every authenticated admin call goes through.

   Puts the access token on the request and deals with it expiring: a 401
   spends the refresh token once — one refresh at a time, however many
   requests are waiting — and replays what failed. A refusal from the server
   clears the session; a dropped connection does not, since that says nothing
   about whether the token is still good. */

import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from './apiError';

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send without the Authorization header: login only. */
  anonymous?: boolean;
}

interface ApiErrorBody {
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
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

function toError(response: Response, body: unknown): ApiError {
  const payload = (body ?? {}) as ApiErrorBody;
  const fallback =
    response.status >= 500
      ? 'Something went wrong at our end. Try again in a moment.'
      : 'That did not work.';
  return new ApiError(
    payload.code ?? `http_${response.status}`,
    payload.detail ?? fallback,
    response.status,
    payload.errors ?? {},
  );
}

/* One refresh at a time. Two requests failing together must not spend two
   refresh tokens — rotation would blacklist whichever loses the race. */
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, clearSession } = useAuthStore.getState();
  if (!refreshToken) return null;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    clearSession();
    return null;
  }

  try {
    const data = (await response.json()) as { access: string; refresh?: string };
    setTokens(data.access, data.refresh ?? refreshToken);
    return data.access;
  } catch {
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
  });
}

async function exchange(path: string, options: RequestOptions): Promise<Response> {
  const token = options.anonymous ? null : useAuthStore.getState().accessToken;

  let response: Response;
  try {
    response = await send(path, options, token);
  } catch {
    throw new ApiError('network', 'No connection. Check your internet and try again.', 0);
  }

  if (response.status === 401 && !options.anonymous && token) {
    const fresh = await withRefresh();
    if (fresh) {
      try {
        response = await send(path, options, fresh);
      } catch {
        throw new ApiError('network', 'No connection. Check your internet and try again.', 0);
      }
    }
  }

  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await exchange(path, options);
  const body = await parse(response);
  if (!response.ok) throw toError(response, body);
  return body as T;
}

export const api = {
  get: <T>(path: string, options: RequestOptions = {}) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
};
