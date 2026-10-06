/* Phone numbers: any country's, as E.164. The rules live in ./phone; these
   are the names the forms have always called. */

import { isPhoneWrong } from './phone';

export { isValidPhone, toE164 } from './phone';

/** Undefined while the number is fine or still being typed; a reason once it
    is as long as its country allows and still is not a mobile number there. */
export const phoneError = (input: string): string | undefined =>
  isPhoneWrong(input) ? 'That is not a mobile number in the selected country.' : undefined;

export const isValidEmail = (input: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());

export const nameError = (input: string): string | undefined => {
  const value = input.trim();
  if (!value) return 'Please tell us your name.';
  if (value.length < 2) return 'Names need at least 2 characters.';
  if (value.length > 40) return 'That is a bit long — 40 characters max.';
  return undefined;
};

export const emailError = (input: string): string | undefined => {
  if (!input.trim()) return undefined;
  return isValidEmail(input) ? undefined : 'That email does not look right.';
};

export const isOtpComplete = (digits: string[]): boolean => digits.every((d) => /^\d$/.test(d));

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const photoError = (file: File): string | undefined => {
  if (!file.type.startsWith('image/')) return 'Please choose a photo (JPG, PNG or HEIC).';
  if (file.size > MAX_PHOTO_BYTES) return 'That photo is over 10 MB. Try a smaller one.';
  return undefined;
};

/* --------------------------------------------------------------------------
   Sign-up fields.

   These answer with a problem *code* rather than a sentence. The older
   validators above return English, which forces every screen to re-derive
   which rule failed before it can pick a translation — that is how wording
   and rules drift apart. A code keeps the rule here and the words in the
   dictionary.
   -------------------------------------------------------------------------- */

export type TextProblem = 'empty' | 'short' | 'long';

/** Required free text: a business name, an address, a job title. */
export const textProblem = (
  input: string,
  { min = 2, max = 60 }: { min?: number; max?: number } = {},
): TextProblem | undefined => {
  const value = input.trim();
  if (!value) return 'empty';
  if (value.length < min) return 'short';
  if (value.length > max) return 'long';
  return undefined;
};

export type EmailProblem = 'empty' | 'invalid';

export const emailProblem = (input: string, required = false): EmailProblem | undefined => {
  const value = input.trim();
  if (!value) return required ? 'empty' : undefined;
  return isValidEmail(value) ? undefined : 'invalid';
};

export type PasswordProblem = 'short' | 'weak';

/** Eight characters with at least one letter and one digit. Short enough to
    type on a phone, long enough to be worth setting. */
export const passwordProblem = (input: string): PasswordProblem | undefined => {
  if (input.length < 8) return 'short';
  if (!/[A-Za-z]/.test(input) || !/\d/.test(input)) return 'weak';
  return undefined;
};

/** How full the strength meter reads, 0–3. Length carries most of it. */
export const passwordStrength = (input: string): 0 | 1 | 2 | 3 => {
  if (!input) return 0;
  let score = 0;
  if (input.length >= 8) score += 1;
  if (input.length >= 12) score += 1;
  if (/[A-Za-z]/.test(input) && /\d/.test(input) && /[^A-Za-z0-9]/.test(input)) score += 1;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
};

export type YearsProblem = 'empty' | 'invalid';

/** Years of experience, as typed. Anything past 60 is a typo, not a career. */
export const yearsProblem = (input: string): YearsProblem | undefined => {
  const value = input.trim();
  if (!value) return 'empty';
  const years = Number(value);
  return Number.isInteger(years) && years >= 0 && years <= 60 ? undefined : 'invalid';
};
