/* Money in any currency, for the subscription tiers.

   The codes are ISO 4217's in use today, the same list the backend checks a
   save against (Apps/subscriptions/currencies.py). Names and symbols come
   from the browser's Intl data rather than being written out here. */

import { formatNumber } from './format';

/** Every plan was priced in taka before plans could have other currencies. */
export const DEFAULT_CURRENCY = 'BDT';

export const CURRENCIES: readonly string[] = [
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
  'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK',
  'DJF', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR',
  'FJD', 'FKP',
  'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
  'HKD', 'HNL', 'HTG', 'HUF',
  'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
  'JMD', 'JOD', 'JPY',
  'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
  'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
  'OMR',
  'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR',
  'RON', 'RSD', 'RUB', 'RWF',
  'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
  'UAH', 'UGX', 'USD', 'UYU', 'UZS',
  'VES', 'VND', 'VUV',
  'WST',
  'XAF', 'XCD', 'XCG', 'XOF', 'XPF',
  'YER',
  'ZAR', 'ZMW', 'ZWG',
];

/** No smaller unit — nobody pays half a yen — so prices in these are whole. */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

export const isWholeOnly = (currency: string): boolean => ZERO_DECIMAL.has(currency);

/** Offered first when a plan is given another price: the currencies a
    salon's customers are likeliest to pay in after taka. */
const LIKELY = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'CAD', 'AUD', 'SGD', 'MYR'];

/** The next currency to suggest, skipping those `taken` already. */
export const nextCurrency = (taken: readonly string[]): string | undefined =>
  [...LIKELY, ...CURRENCIES].find((code) => !taken.includes(code));

let names: Intl.DisplayNames | undefined;

/** "Bangladeshi Taka" for "BDT". */
export const currencyName = (code: string): string => {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'currency' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
};

const symbolIn = (code: string, display: 'symbol' | 'narrowSymbol'): string => {
  try {
    return (
      new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: display })
        .formatToParts(1)
        .find((part) => part.type === 'currency')?.value ?? code
    );
  } catch {
    return code;
  }
};

/** A real currency sign ("৳", "₦", "E£") rather than letters ("Rp", "K"),
    and none added to Unicode since 2021 — the som's "⃀" is missing from most
    fonts. */
const isSign = (sign: string): boolean =>
  /\p{Sc}/u.test(sign) && [...sign].every((char) => (char.codePointAt(0) ?? 0) < 0x20c0);

let symbols: Map<string, string> | undefined;

/** Every currency's sign, each one telling its currency apart from the rest:
    "$" is the US dollar, the Canadian one is "CA$". English names most
    currencies by their code; one with a sign of its own is shown with it
    ("৳", "₦", "฿"), and one that shares its sign ("kr", "Rs") keeps the code. */
const symbolTable = (): Map<string, string> => {
  if (symbols) return symbols;
  const narrow = new Map(CURRENCIES.map((code) => [code, symbolIn(code, 'narrowSymbol')]));
  const uses = new Map<string, number>();
  for (const sign of narrow.values()) uses.set(sign, (uses.get(sign) ?? 0) + 1);
  symbols = new Map(
    CURRENCIES.map((code) => {
      const symbol = symbolIn(code, 'symbol');
      const sign = narrow.get(code) ?? code;
      return [code, symbol === code && uses.get(sign) === 1 && isSign(sign) ? sign : symbol];
    }),
  );
  return symbols;
};

export const currencySymbol = (code: string): string => symbolTable().get(code) ?? code;

const fractionFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The number alone: "500", "4.99" — cents only when there are some. */
export const formatAmount = (amount: number): string =>
  Number.isInteger(amount) ? formatNumber(amount) : fractionFmt.format(amount);

/** "৳500", "$4.99", "CA$7", "SAR 20" — a sign that ends in a letter is set
    apart from the number. */
export const formatMoney = (amount: number, currency: string): string => {
  const symbol = currencySymbol(currency);
  const gap = symbol.length > 1 && /[\p{L}.]$/u.test(symbol) ? ' ' : '';
  return `${symbol}${gap}${formatAmount(amount)}`;
};

export interface CurrencyOption {
  code: string;
  /** "USD · US Dollar" — the code first, so typing it in an open list finds it. */
  label: string;
}

let options: CurrencyOption[] | undefined;

export const currencyOptions = (): CurrencyOption[] =>
  (options ??= CURRENCIES.map((code) => ({ code, label: `${code} · ${currencyName(code)}` })));
