/* The one error type every API path throws.

   It lives in its own module because the API client, the services and the
   360° try-on's polling (`utils/tryOnVideoService.ts`) all raise it, and a
   class shared through any one of them would be an import cycle. */

export class ApiError extends Error {
  code: string;
  /** HTTP status when the failure came from a response, 0 for network/abort. */
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

/** True for failures where trying the same request again could work. */
export const isRetryable = (error: unknown): boolean =>
  error instanceof ApiError &&
  ['network', 'timeout', 'rate_limited', 'provider_timeout', 'provider_unreachable', 'server_error'].includes(
    error.code,
  );
