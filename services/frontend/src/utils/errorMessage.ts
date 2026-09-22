/* One place to turn a thrown thing into a line someone can read.

   Every call in this app throws `ApiValidationError`, which already carries
   the server's own `detail`. Anything else — a bug, an abort — should not be
   shown raw, so it falls back to a plain sentence. */

import { ApiValidationError } from './apiClient';

export function messageOf(error: unknown, fallback = 'That did not work.'): string {
  if (error instanceof ApiValidationError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** The message the server attached to one field, when it blamed one. */
export function fieldMessageOf(error: unknown, field: string): string | undefined {
  return error instanceof ApiValidationError ? error.fieldError(field) : undefined;
}
