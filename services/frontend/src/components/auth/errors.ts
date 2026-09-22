import type { TFunction, TKey } from '../../i18n';
import { ApiValidationError } from '../../utils/apiClient';

/* The backend answers in English with a `code`. The code is the stable part,
   so the app translates that and keeps the server's own sentence as the
   fallback for anything not listed here. */

const MESSAGE_KEYS: Record<string, TKey> = {
  network: 'auth.errNetwork',
  invalid_credentials: 'auth.errSignIn',
  account_disabled: 'auth.errAccountDisabled',
  account_not_found: 'auth.errAccountNotFound',
  phone_taken: 'auth.errPhoneTaken',
  invalid_phone: 'auth.errPhoneDigits',
  password_invalid: 'auth.errPasswordPolicy',
  password_mismatch: 'auth.errPasswordMatch',
  terms_required: 'auth.errTermsRequired',
  otp_invalid: 'auth.otpFailed',
  otp_expired: 'auth.errOtpExpired',
  otp_attempts: 'auth.errOtpAttempts',
  otp_missing: 'auth.errOtpMissing',
  otp_send_limit: 'auth.errOtpSendLimit',
  sms_unavailable: 'auth.errSmsUnavailable',
  reset_token_expired: 'auth.errResetExpired',
  reset_token_invalid: 'auth.errResetInvalid',
  invalid_password: 'auth.errCurrentPassword',
  already_verified: 'auth.errAlreadyVerified',
  already_employed: 'auth.errAlreadyEmployed',
  phone_is_customer: 'auth.errPhoneIsCustomer',
  phone_not_available: 'auth.errPhoneNotAvailable',
  no_salon: 'auth.errNoSalon',
};

/** What to show the user for a failed call. */
export function authErrorMessage(t: TFunction, error: unknown): string {
  if (!(error instanceof ApiValidationError)) return t('auth.errUnexpected');
  if (error.code === 'otp_cooldown' && error.retryAfter) {
    return t('auth.errOtpCooldown', { seconds: error.retryAfter });
  }
  const key = MESSAGE_KEYS[error.code];
  if (key) return t(key);
  if (error.status >= 500) return t('auth.errServer');
  // Anything unmapped: the server's own sentence beats a shrug.
  return error.message;
}

/** The server's complaint about one field, for a form that can point at it. */
export function fieldMessage(error: unknown, field: string): string | undefined {
  return error instanceof ApiValidationError ? error.fieldError(field) : undefined;
}
