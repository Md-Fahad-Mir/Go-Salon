/* Bangladeshi mobile numbers: 11 digits with a leading 0 (01XXXXXXXXX) or 10
   digits after +880. Operator prefixes are 013–019. */

const LOCAL_RE = /^1[3-9]\d{8}$/;

/** Keeps only digits and drops any international-dialing/leading zeros and
    the country code, in whatever order they were pasted in — "00880...",
    "0088...", "+880...", and "01..." all reduce to the same 10 digits. */
export const localDigits = (input: string): string => {
  let digits = input.replace(/\D/g, '');
  while (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('880')) digits = digits.slice(3);
  while (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

export const isValidPhone = (input: string): boolean => LOCAL_RE.test(localDigits(input));

/** Normalises any accepted form to E.164. */
export const toE164 = (input: string): string => `+880${localDigits(input)}`;

/** Pretty form while typing: "1712 345678". */
export const formatLocalPhone = (digits: string): string => {
  const d = digits.slice(0, 10);
  return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d;
};

export const phoneError = (input: string): string | undefined => {
  const digits = localDigits(input);
  if (!digits) return undefined;
  if (digits.length < 10) return undefined; // still typing
  /* One answer for any bad number. Which operator prefixes Bangladesh issues
     is a rule this field enforces, not a lesson to read back to somebody who
     mistyped a digit. */
  if (!LOCAL_RE.test(digits)) return 'Enter the 10 digits after +880.';
  return undefined;
};

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
