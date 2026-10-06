/* Phone numbers from any country.

   Every number the app sends or keeps is E.164: a "+", the country calling
   code, then the national number without its trunk prefix — "+8801712345678",
   "+447911123456", "+12133734253". The backend stores the same form
   (Apps/users/phone.py), so the two always agree on which account a number is.

   What a valid number looks like in each country — its length, its prefixes,
   which ranges are mobiles — comes from libphonenumber's metadata, never from
   a pattern written here. The `mobile` set is used on purpose: every number in
   this app either signs in with a code sent by text or is one a customer is
   texted on, so a landline is not a number it can use. */

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/mobile';
import examples from 'libphonenumber-js/mobile/examples';
import metadata from 'libphonenumber-js/mobile/metadata';
import { STORAGE_KEYS } from '../constants';
import { safeLocal } from './storage';

export type { CountryCode };

/** E.164 allows fifteen digits after the "+". */
const MAX_DIGITS = 15;

/** The country the field opens on when this device has never picked one.
    A starting point, not a restriction — any country can be chosen — and set
    per deployment with VITE_DEFAULT_PHONE_COUNTRY. */
const CONFIGURED = String(import.meta.env.VITE_DEFAULT_PHONE_COUNTRY ?? '').trim().toUpperCase();
export const DEFAULT_COUNTRY: CountryCode = isSupportedCountry(CONFIGURED) ? CONFIGURED : 'BD';

/** The country to preselect: the last one picked on this device, so somebody
    abroad is not made to find theirs again every time they sign in. */
export const preferredCountry = (): CountryCode => {
  const saved = safeLocal.get<string>(STORAGE_KEYS.phoneCountry, '');
  return isSupportedCountry(saved) ? saved : DEFAULT_COUNTRY;
};

export const rememberCountry = (country: CountryCode): void =>
  safeLocal.set(STORAGE_KEYS.phoneCountry, country);

export const callingCodeOf = (country: CountryCode): string => getCountryCallingCode(country);

/** 🇧🇩 from "BD": two regional-indicator letters. */
export const flagOf = (country: CountryCode): string =>
  String.fromCodePoint(...[...country].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));

export interface CountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
}

const optionCache = new Map<string, CountryOption[]>();

/** Every country libphonenumber knows, named in `locale` and sorted the way
    that language sorts. */
export const countryOptions = (locale: string): CountryOption[] => {
  const cached = optionCache.get(locale);
  if (cached) return cached;
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = undefined;
  }
  const collator = new Intl.Collator(locale);
  const options = getCountries()
    .map((code) => ({
      code,
      name: names?.of(code) ?? code,
      callingCode: getCountryCallingCode(code),
      flag: flagOf(code),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
  optionCache.set(locale, options);
  return options;
};

/** The country a full or partial E.164 number belongs to. A complete number
    names its own (+1 416… is Canada); a partial one falls back to the main
    country for its calling code (+1 is the US until the area code says
    otherwise). Undefined for a calling code no country has. */
export const countryOfNumber = (value: string): CountryCode | undefined => {
  if (!value.startsWith('+')) return undefined;
  const typed = new AsYouType();
  typed.input(value);
  const callingCode = typed.getCallingCode();
  const main = callingCode ? metadata.country_calling_codes[callingCode]?.[0] : undefined;
  return typed.getCountry() ?? (main && isSupportedCountry(main) ? main : undefined);
};

/** Drops trailing digits until the number is no longer than its country
    allows — the same "an extra digit does nothing" the field always had. */
const capLength = (value: string): string => {
  let capped = value.slice(0, MAX_DIGITS + 1);
  while (capped.length > 2 && validatePhoneNumberLength(capped) === 'TOO_LONG') capped = capped.slice(0, -1);
  return capped;
};

/** What was typed into the number half of the field, read as a number in
    `country`, in E.164 — or '' while there are no national digits yet.
    Takes the ways people write their own number: with the trunk prefix
    (01712…, 07911…) and with the calling code but no "+" (8801712…). */
export const fromNational = (input: string, country: CountryCode): string => {
  const digits = input.replace(/\D/g, '').slice(0, MAX_DIGITS + 4);
  if (!digits) return '';
  const typed = new AsYouType(country);
  typed.input(digits);
  const number = typed.getNumber()?.number;
  return number ? capLength(number) : '';
};

/** A number written with its calling code — pasted, autofilled, typed after
    a "+" or "00". Undefined until the calling code is complete. */
export const fromInternational = (
  input: string,
): { value: string; country: CountryCode } | undefined => {
  const digits = input.trim().replace(/^(\+|00)/, '').replace(/\D/g, '').slice(0, MAX_DIGITS);
  if (!digits) return undefined;
  const country = countryOfNumber(`+${digits}`);
  if (!country) return undefined;
  const typed = new AsYouType();
  typed.input(`+${digits}`);
  const number = typed.getNumber()?.number;
  return { country, value: number ? capLength(number) : '' };
};

/** The national half of an E.164 number, spaced the way its country writes
    it: "+8801712345678" in BD reads "1712 345678". */
export const nationalDisplay = (value: string, country: CountryCode): string => {
  if (!value) return '';
  const formatted = new AsYouType().input(value);
  const prefix = `+${callingCodeOf(country)}`;
  return formatted.startsWith(prefix) ? formatted.slice(prefix.length).trim() : formatted;
};

/** A real-looking mobile number for the country, for the placeholder. */
export const examplePhone = (country: CountryCode): string => {
  const example = getExampleNumber(country, examples);
  return example ? nationalDisplay(example.number, country) : '';
};

/** A complete, valid mobile number for its country. */
export const isValidPhone = (value: string): boolean =>
  value.startsWith('+') && isValidPhoneNumber(value);

/** Whether to tell somebody the number is wrong. Stays quiet while there is
    still room for another digit — a half-typed number is not a mistake —
    and speaks up once it is as long as it can be and still is not valid. */
export const isPhoneWrong = (value: string): boolean => {
  if (!value || isValidPhone(value)) return false;
  const length = validatePhoneNumberLength(value);
  if (length === 'NOT_A_NUMBER' || length === 'INVALID_COUNTRY' || length === 'TOO_LONG') return true;
  return validatePhoneNumberLength(`${value}0`) === 'TOO_LONG';
};

/** E.164 for anything parseable; the input itself otherwise. */
export const toE164 = (value: string): string => parsePhoneNumberFromString(value)?.number ?? value;

/** "+8801712345678" → "+880 1712 345678". */
export const formatInternational = (value: string): string =>
  parsePhoneNumberFromString(value)?.formatInternational() ?? value;

/** "+8801712345678" → "+880 17•• •••678": the country, the first two and the
    last three digits, for receipts and the code screen. */
export const maskNumber = (value: string): string => {
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed) return value;
  const shown = parsed.formatInternational();
  const prefix = `+${parsed.countryCallingCode}`;
  const national = parsed.nationalNumber.length;
  let index = 0;
  const masked = shown.slice(prefix.length).replace(/\d/g, (digit) => {
    const at = index++;
    return at < 2 || at >= national - 3 ? digit : '•';
  });
  return `${prefix}${masked}`;
};
