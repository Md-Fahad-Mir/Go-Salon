/* Phone numbers from any country, as E.164 — "+8801712345678",
   "+447400123456" — the form the backend stores and looks accounts up by
   (Apps/users/phone.py). What is valid in each country comes from
   libphonenumber's metadata; the `mobile` set, because every account's
   number is one a sign-in code is texted to. The customer app has the same
   rules in services/frontend/src/utils/phone.ts. */

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  isValidPhoneNumber,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/mobile';
import examples from 'libphonenumber-js/mobile/examples';
import metadata from 'libphonenumber-js/mobile/metadata';

export type { CountryCode };

/** E.164 allows fifteen digits after the "+". */
const MAX_DIGITS = 15;

/** The country an empty phone field opens on. Any country can be picked;
    set per deployment with VITE_DEFAULT_PHONE_COUNTRY. */
const CONFIGURED = String(import.meta.env.VITE_DEFAULT_PHONE_COUNTRY ?? '').trim().toUpperCase();
export const DEFAULT_COUNTRY: CountryCode = isSupportedCountry(CONFIGURED) ? CONFIGURED : 'BD';

export const callingCodeOf = (country: CountryCode): string => getCountryCallingCode(country);

/** 🇧🇩 from "BD". */
export const flagOf = (country: CountryCode): string =>
  String.fromCodePoint(...[...country].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));

export interface CountryOption {
  code: CountryCode;
  label: string;
}

let options: CountryOption[] | undefined;

/** Every country, by English name: "🇧🇩 Bangladesh (+880)". */
export const countryOptions = (): CountryOption[] => {
  if (options) return options;
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = undefined;
  }
  options = getCountries()
    .map((code) => ({ code, name: names?.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ code, name }) => ({ code, label: `${flagOf(code)} ${name} (+${getCountryCallingCode(code)})` }));
  return options;
};

/** The country a full or partial E.164 number belongs to: a complete one
    names its own (+1 416… is Canada), a partial one the main country for its
    calling code (+1 is the US). */
export const countryOfNumber = (value: string): CountryCode | undefined => {
  if (!value.startsWith('+')) return undefined;
  const typed = new AsYouType();
  typed.input(value);
  const callingCode = typed.getCallingCode();
  const main = callingCode ? metadata.country_calling_codes[callingCode]?.[0] : undefined;
  return typed.getCountry() ?? (main && isSupportedCountry(main) ? main : undefined);
};

/** Drops trailing digits past the longest number the country has. */
const capLength = (value: string): string => {
  let capped = value.slice(0, MAX_DIGITS + 1);
  while (capped.length > 2 && validatePhoneNumberLength(capped) === 'TOO_LONG') capped = capped.slice(0, -1);
  return capped;
};

/** Digits typed after the country picker, as E.164 — '' while there are
    none. Takes a trunk prefix (01712…, 07400…) or a code without its "+". */
export const fromNational = (input: string, country: CountryCode): string => {
  const digits = input.replace(/\D/g, '').slice(0, MAX_DIGITS + 4);
  if (!digits) return '';
  const typed = new AsYouType(country);
  typed.input(digits);
  const number = typed.getNumber()?.number;
  return number ? capLength(number) : '';
};

/** A number pasted with its calling code ("+44 7400 123456", "00880…").
    Undefined until the calling code is complete. */
export const fromInternational = (input: string): { value: string; country: CountryCode } | undefined => {
  const digits = input.trim().replace(/^(\+|00)/, '').replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (!digits) return undefined;
  const country = countryOfNumber(`+${digits}`);
  if (!country) return undefined;
  const typed = new AsYouType();
  typed.input(`+${digits}`);
  const number = typed.getNumber()?.number;
  return { country, value: number ? capLength(number) : '' };
};

/** "+8801712345678" in BD reads "1712 345678". */
export const nationalDisplay = (value: string, country: CountryCode): string => {
  if (!value) return '';
  const formatted = new AsYouType().input(value);
  const prefix = `+${callingCodeOf(country)}`;
  return formatted.startsWith(prefix) ? formatted.slice(prefix.length).trim() : formatted;
};

export const examplePhone = (country: CountryCode): string => {
  const example = getExampleNumber(country, examples);
  return example ? nationalDisplay(example.number, country) : '';
};

/** A complete, valid mobile number for its country. */
export const isValidPhone = (value: string): boolean => value.startsWith('+') && isValidPhoneNumber(value);

/** Wrong, and finished: as long as its country allows and still not valid.
    Quiet while another digit could still come. */
export const isPhoneWrong = (value: string): boolean => {
  if (!value || isValidPhone(value)) return false;
  const length = validatePhoneNumberLength(value);
  if (length === 'NOT_A_NUMBER' || length === 'INVALID_COUNTRY' || length === 'TOO_LONG') return true;
  return validatePhoneNumberLength(`${value}0`) === 'TOO_LONG';
};

export const PHONE_INVALID_MESSAGE = 'Enter a valid mobile number for the selected country.';
