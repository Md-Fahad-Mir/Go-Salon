/* The currency a customer pays in, and plan prices shown in it.

   A plan has a main price and may have others (Apps/subscriptions): ৳500,
   and $5 for anyone who pays in dollars. A customer sees the price in their
   own currency when the plan has one, and the main price when it does not.

   Their currency is their phone number's country's: the one thing every
   account has that says where somebody is. Before sign-in it is the country
   this device last picked for a phone number. */

import type { PlanPrice, SubscriptionPlan } from '../types';
import { activeNumberLocale } from './locale';
import { countryOfNumber, preferredCountry } from './phone';

/** Each country's currency, for every country the phone field offers. */
const COUNTRY_CURRENCY: Record<string, string> = {
  AC: 'SHP', AD: 'EUR', AE: 'AED', AF: 'AFN', AG: 'XCD', AI: 'XCD', AL: 'ALL', AM: 'AMD', AO: 'AOA', AR: 'ARS',
  AS: 'USD', AT: 'EUR', AU: 'AUD', AW: 'AWG', AX: 'EUR', AZ: 'AZN',
  BA: 'BAM', BB: 'BBD', BD: 'BDT', BE: 'EUR', BF: 'XOF', BG: 'EUR', BH: 'BHD', BI: 'BIF', BJ: 'XOF', BL: 'EUR',
  BM: 'BMD', BN: 'BND', BO: 'BOB', BQ: 'USD', BR: 'BRL', BS: 'BSD', BT: 'BTN', BW: 'BWP', BY: 'BYN', BZ: 'BZD',
  CA: 'CAD', CC: 'AUD', CD: 'CDF', CF: 'XAF', CG: 'XAF', CH: 'CHF', CI: 'XOF', CK: 'NZD', CL: 'CLP', CM: 'XAF',
  CN: 'CNY', CO: 'COP', CR: 'CRC', CU: 'CUP', CV: 'CVE', CW: 'XCG', CX: 'AUD', CY: 'EUR', CZ: 'CZK',
  DE: 'EUR', DJ: 'DJF', DK: 'DKK', DM: 'XCD', DO: 'DOP', DZ: 'DZD',
  EC: 'USD', EE: 'EUR', EG: 'EGP', EH: 'MAD', ER: 'ERN', ES: 'EUR', ET: 'ETB',
  FI: 'EUR', FJ: 'FJD', FK: 'FKP', FM: 'USD', FO: 'DKK', FR: 'EUR',
  GA: 'XAF', GB: 'GBP', GD: 'XCD', GE: 'GEL', GF: 'EUR', GG: 'GBP', GH: 'GHS', GI: 'GIP', GL: 'DKK', GM: 'GMD',
  GN: 'GNF', GP: 'EUR', GQ: 'XAF', GR: 'EUR', GT: 'GTQ', GU: 'USD', GW: 'XOF', GY: 'GYD',
  HK: 'HKD', HN: 'HNL', HR: 'EUR', HT: 'HTG', HU: 'HUF',
  ID: 'IDR', IE: 'EUR', IL: 'ILS', IM: 'GBP', IN: 'INR', IO: 'USD', IQ: 'IQD', IR: 'IRR', IS: 'ISK', IT: 'EUR',
  JE: 'GBP', JM: 'JMD', JO: 'JOD', JP: 'JPY',
  KE: 'KES', KG: 'KGS', KH: 'KHR', KI: 'AUD', KM: 'KMF', KN: 'XCD', KP: 'KPW', KR: 'KRW', KW: 'KWD', KY: 'KYD',
  KZ: 'KZT',
  LA: 'LAK', LB: 'LBP', LC: 'XCD', LI: 'CHF', LK: 'LKR', LR: 'LRD', LS: 'LSL', LT: 'EUR', LU: 'EUR', LV: 'EUR',
  LY: 'LYD',
  MA: 'MAD', MC: 'EUR', MD: 'MDL', ME: 'EUR', MF: 'EUR', MG: 'MGA', MH: 'USD', MK: 'MKD', ML: 'XOF', MM: 'MMK',
  MN: 'MNT', MO: 'MOP', MP: 'USD', MQ: 'EUR', MR: 'MRU', MS: 'XCD', MT: 'EUR', MU: 'MUR', MV: 'MVR', MW: 'MWK',
  MX: 'MXN', MY: 'MYR', MZ: 'MZN',
  NA: 'NAD', NC: 'XPF', NE: 'XOF', NF: 'AUD', NG: 'NGN', NI: 'NIO', NL: 'EUR', NO: 'NOK', NP: 'NPR', NR: 'AUD',
  NU: 'NZD', NZ: 'NZD',
  OM: 'OMR',
  PA: 'PAB', PE: 'PEN', PF: 'XPF', PG: 'PGK', PH: 'PHP', PK: 'PKR', PL: 'PLN', PM: 'EUR', PR: 'USD', PS: 'ILS',
  PT: 'EUR', PW: 'USD', PY: 'PYG',
  QA: 'QAR',
  RE: 'EUR', RO: 'RON', RS: 'RSD', RU: 'RUB', RW: 'RWF',
  SA: 'SAR', SB: 'SBD', SC: 'SCR', SD: 'SDG', SE: 'SEK', SG: 'SGD', SH: 'SHP', SI: 'EUR', SJ: 'NOK', SK: 'EUR',
  SL: 'SLE', SM: 'EUR', SN: 'XOF', SO: 'SOS', SR: 'SRD', SS: 'SSP', ST: 'STN', SV: 'USD', SX: 'XCG', SY: 'SYP',
  SZ: 'SZL',
  TA: 'GBP', TC: 'USD', TD: 'XAF', TG: 'XOF', TH: 'THB', TJ: 'TJS', TK: 'NZD', TL: 'USD', TM: 'TMT', TN: 'TND',
  TO: 'TOP', TR: 'TRY', TT: 'TTD', TV: 'AUD', TW: 'TWD', TZ: 'TZS',
  UA: 'UAH', UG: 'UGX', US: 'USD', UY: 'UYU', UZ: 'UZS',
  VA: 'EUR', VC: 'XCD', VE: 'VES', VG: 'USD', VI: 'USD', VN: 'VND', VU: 'VUV',
  WF: 'XPF', WS: 'WST',
  XK: 'EUR',
  YE: 'YER', YT: 'EUR',
  ZA: 'ZAR', ZM: 'ZMW', ZW: 'ZWG',
};

export const currencyOfCountry = (country: string): string | undefined => COUNTRY_CURRENCY[country];

/** The currency the owner of `phone` pays in — or, without a number, the
    one for the country this device last picked. */
export const customerCurrency = (phone?: string | null): string | undefined =>
  currencyOfCountry((phone ? countryOfNumber(phone) : undefined) ?? preferredCountry());

/** What `plan` costs somebody paying in `currency`: its price in that
    currency when it has one, its main price otherwise. A free plan is free
    in every currency, so it reads 0 in theirs. */
export const localPrice = (plan: SubscriptionPlan, currency: string | undefined): PlanPrice => {
  if (!currency) return plan.price;
  if (plan.price.amount === 0) return { currency, amount: 0 };
  return [plan.price, ...plan.otherPrices].find((price) => price.currency === currency) ?? plan.price;
};

const signOf = (currency: string): string => {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
};

/** "৳৫০০" in Bangla, "$4.99", "€4.50" — the sign before the amount, the way
    taka has always been written here, and cents only when there are some.

    The sign is the local one ("$") when the price is in the customer's own
    currency. A price in anyone else's carries its code ("USD 5"), since a
    bare "$" means a different dollar to a Canadian. */
export const formatMoney = ({ amount, currency }: PlanPrice, own: string | undefined): string => {
  const sign = currency === own ? signOf(currency) : currency;
  const gap = sign.length > 1 && /[\p{L}.]$/u.test(sign) ? ' ' : '';
  const number = new Intl.NumberFormat(
    activeNumberLocale(),
    Number.isInteger(amount) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(amount);
  return `${sign}${gap}${number}`;
};
