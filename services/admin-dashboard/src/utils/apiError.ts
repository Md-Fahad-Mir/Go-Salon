/** A failed admin API call. `code` and `detail` come straight from the
    backend's `{detail, code, errors}` shape (see Apps/users/exceptions.py),
    so a caller can branch on `code` without parsing prose. */
export class ApiError extends Error {
  code: string;
  /** HTTP status when the failure came from a response, 0 for network/abort. */
  status: number;
  errors: Record<string, string[]>;

  constructor(code: string, message: string, status = 0, errors: Record<string, string[]> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.errors = errors;
    this.name = 'ApiError';
  }
}
