"""The currencies a plan can be priced in: the ISO 4217 codes in use today.

Written out here rather than read from a library — nothing the backend
depends on lists them, and the list barely moves. The most recent changes:
the Caribbean guilder (XCG) replaced the Antillean one in 2025, and Bulgaria
moved to the euro in 2026. Funds, precious metals and codes withdrawn since
are left out.

The admin dashboard keeps the same list (src/utils/currency.ts) for its
pickers; this one is what a save is checked against.
"""

from __future__ import annotations

#: Every plan was priced in taka before plans could have other currencies.
DEFAULT_CURRENCY = 'BDT'

CURRENCIES = frozenset({
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
})

#: Currencies with no smaller unit — nobody pays half a yen — so a price in
#: one is a whole number.
ZERO_DECIMAL = frozenset({
    'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF',
    'XPF',
})
