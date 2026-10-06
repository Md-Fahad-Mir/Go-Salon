/* Phone numbers from any country, in the one shape the backend stores.

   The rules come from libphonenumber; what is tested here is that the app
   asks it the right questions — that a number typed the way its owner writes
   it comes out as the E.164 the server expects, and that Bangladeshi numbers
   behave exactly as they did when they were the only kind. */

import { describe, expect, it } from 'vitest';
import {
  countryOfNumber,
  fromInternational,
  fromNational,
  isPhoneWrong,
  isValidPhone,
  maskNumber,
  nationalDisplay,
  toE164,
} from './phone';

describe('a number typed the way its country writes it', () => {
  it.each([
    ['BD', '01712345678', '+8801712345678'],
    ['BD', '1712 345678', '+8801712345678'],
    ['BD', '8801712345678', '+8801712345678'],
    ['GB', '07911 123456', '+447911123456'],
    ['US', '(213) 373-4253', '+12133734253'],
    ['IN', '98765 43210', '+919876543210'],
    ['AE', '050 123 4567', '+971501234567'],
  ] as const)('%s %s is %s', (country, typed, e164) => {
    expect(fromNational(typed, country)).toBe(e164);
  });

  it('is nothing until there is a digit of the number itself', () => {
    expect(fromNational('', 'BD')).toBe('');
    // A trunk prefix on its own is not a number yet.
    expect(fromNational('0', 'BD')).toBe('');
    expect(fromNational('0', 'GB')).toBe('');
  });

  it('ignores a digit past the longest number the country has', () => {
    expect(fromNational('17123456789', 'BD')).toBe('+8801712345678');
  });
});

describe('a number written with its calling code', () => {
  it('names its own country', () => {
    expect(fromInternational('+44 7400 123456')).toEqual({ country: 'GB', value: '+447400123456' });
    expect(fromInternational('00880 1712-345678')).toEqual({ country: 'BD', value: '+8801712345678' });
  });

  it('waits until the calling code is complete', () => {
    expect(fromInternational('+')).toBeUndefined();
    expect(fromInternational('+8')).toBeUndefined();
    expect(fromInternational('+44')).toEqual({ country: 'GB', value: '' });
  });

  it('tells countries that share a calling code apart once the number says which', () => {
    expect(countryOfNumber('+1')).toBe('US');
    expect(countryOfNumber('+14165550123')).toBe('CA');
    expect(countryOfNumber('+7')).toBe('RU');
    // Guernsey's mobiles are +44 too.
    expect(countryOfNumber('+447911123456')).toBe('GG');
  });
});

describe('what counts as a valid number', () => {
  it('accepts a mobile from any country', () => {
    for (const number of ['+8801712345678', '+447911123456', '+12133734253', '+919876543210', '+971501234567']) {
      expect(isValidPhone(number)).toBe(true);
    }
  });

  it('refuses what is not a mobile, as the Bangladeshi-only check did', () => {
    // 012 is not an operator prefix; that was always refused.
    expect(isValidPhone('+8801212345678')).toBe(false);
    // A London landline cannot receive the sign-up code.
    expect(isValidPhone('+442079460000')).toBe(false);
    expect(isValidPhone('01712345678')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  it('does not complain about a number that is still being typed', () => {
    expect(isPhoneWrong('')).toBe(false);
    expect(isPhoneWrong('+880171')).toBe(false);
    // Nine digits is a length Bangladesh uses, but a tenth can still come.
    expect(isPhoneWrong('+880171234567')).toBe(false);
    expect(isPhoneWrong('+8801712345678')).toBe(false);
  });

  it('complains once the number is as long as it can be and still wrong', () => {
    expect(isPhoneWrong('+8801212345678')).toBe(true);
  });
});

describe('showing a number', () => {
  it('spaces the national part the way its country does', () => {
    expect(nationalDisplay('+8801712345678', 'BD')).toBe('1712 345678');
    expect(nationalDisplay('+447911123456', 'GB')).toBe('7911 123456');
    expect(nationalDisplay('', 'BD')).toBe('');
  });

  it('masks all but the country, two leading and three trailing digits', () => {
    expect(maskNumber('+8801712345678')).toBe('+880 17•• •••678');
    expect(maskNumber('+447911123456')).toBe('+44 79•• •••456');
  });

  it('normalises any formatting to E.164', () => {
    expect(toE164('+44 (0) 7911 123-456')).toBe('+447911123456');
    expect(toE164('+8801712345678')).toBe('+8801712345678');
  });
});
