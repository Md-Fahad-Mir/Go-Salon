import type { TKey } from '../../i18n';
import type { PaymentMethod } from '../../types';

/** bKash, Nagad and Rocket are brand names and stay in Latin script in both
    languages; only the generic "Card" is translated. */
export const PAYMENT_METHOD_KEYS: Record<PaymentMethod, TKey> = {
  bkash: 'booking.methodBkash',
  nagad: 'booking.methodNagad',
  rocket: 'booking.methodRocket',
  card: 'booking.methodCard',
};

/** The one-line hint under each method name. */
export const PAYMENT_HINT_KEYS: Record<PaymentMethod, TKey> = {
  bkash: 'booking.hintMobileMoney',
  nagad: 'booking.hintMobileMoney',
  rocket: 'booking.hintMobileMoney',
  card: 'booking.hintCard',
};
