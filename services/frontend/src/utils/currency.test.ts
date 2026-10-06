/* Plan prices in the customer's own currency.

   A customer sees a plan's price in the currency their phone number's
   country pays in when the admin has set one, and its main price when not —
   with nobody left looking at a "$" that might be somebody else's dollar. */

import { getCountries } from 'libphonenumber-js/mobile';
import { afterEach, describe, expect, it } from 'vitest';
import type { SubscriptionPlan } from '../types';
import { currencyOfCountry, customerCurrency, formatMoney, localPrice } from './currency';
import { setActiveLanguage } from './locale';

const plan = (overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
  slug: 'basic',
  name: 'Basic',
  price: { currency: 'BDT', amount: 500 },
  otherPrices: [
    { currency: 'USD', amount: 4.99 },
    { currency: 'EUR', amount: 4.5 },
  ],
  monthlyCredits: 30,
  features: [],
  featured: false,
  ...overrides,
});

afterEach(() => setActiveLanguage('en'));

describe('the currency a customer pays in', () => {
  it.each([
    ['+8801712345678', 'BDT'],
    ['+12133734253', 'USD'],
    ['+14165550123', 'CAD'],
    ['+447911123456', 'GBP'],
    ['+919876543210', 'INR'],
    ['+971501234567', 'AED'],
    ['+4915123456789', 'EUR'],
  ])('is %s’s country’s: %s', (phone, currency) => {
    expect(customerCurrency(phone)).toBe(currency);
  });

  it('is known for every country a phone number can be from', () => {
    expect(getCountries().filter((country) => !currencyOfCountry(country))).toEqual([]);
  });

  it('falls back to this device’s country without a number', () => {
    expect(customerCurrency(undefined)).toBe('BDT');
  });
});

describe('a plan’s price for one customer', () => {
  it('is the one in their currency when the plan has it', () => {
    expect(localPrice(plan(), 'USD')).toEqual({ currency: 'USD', amount: 4.99 });
    expect(localPrice(plan(), 'BDT')).toEqual({ currency: 'BDT', amount: 500 });
  });

  it('is the main price when it does not', () => {
    expect(localPrice(plan(), 'JPY')).toEqual({ currency: 'BDT', amount: 500 });
    expect(localPrice(plan(), undefined)).toEqual({ currency: 'BDT', amount: 500 });
  });

  it('is free in every currency for a free plan', () => {
    const free = plan({ price: { currency: 'BDT', amount: 0 }, otherPrices: [] });
    expect(localPrice(free, 'GBP')).toEqual({ currency: 'GBP', amount: 0 });
  });
});

describe('a price, written out', () => {
  it('puts the local sign before the amount, cents only when there are some', () => {
    expect(formatMoney({ currency: 'BDT', amount: 500 }, 'BDT')).toBe('৳500');
    expect(formatMoney({ currency: 'USD', amount: 4.99 }, 'USD')).toBe('$4.99');
    expect(formatMoney({ currency: 'EUR', amount: 4.5 }, 'EUR')).toBe('€4.50');
    expect(formatMoney({ currency: 'CAD', amount: 7 }, 'CAD')).toBe('$7');
  });

  it('names somebody else’s currency by its code', () => {
    expect(formatMoney({ currency: 'USD', amount: 5 }, 'CAD')).toBe('USD 5');
    expect(formatMoney({ currency: 'BDT', amount: 1200 }, 'GBP')).toBe('BDT 1,200');
  });

  it('writes taka in Bengali digits in Bangla, as it always has', () => {
    setActiveLanguage('bn');
    expect(formatMoney({ currency: 'BDT', amount: 500 }, 'BDT')).toBe('৳৫০০');
  });
});
