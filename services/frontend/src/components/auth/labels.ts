import type { TKey } from '../../i18n';
import type { HairLength, HairType } from '../../types';

/* The hair options in `src/constants` carry English labels for the data layer.
   These maps turn a constant's `id` into a translation key so the tiles read
   in the active language without the constants themselves knowing about i18n. */

export const HAIR_TYPE_KEYS: Record<HairType, TKey> = {
  straight: 'auth.hairTypeStraight',
  wavy: 'auth.hairTypeWavy',
  curly: 'auth.hairTypeCurly',
  coily: 'auth.hairTypeCoily',
};

export const HAIR_TYPE_HINT_KEYS: Record<HairType, TKey> = {
  straight: 'auth.hairTypeStraightHint',
  wavy: 'auth.hairTypeWavyHint',
  curly: 'auth.hairTypeCurlyHint',
  coily: 'auth.hairTypeCoilyHint',
};

export const HAIR_LENGTH_KEYS: Record<HairLength, TKey> = {
  short: 'auth.hairLengthShort',
  medium: 'auth.hairLengthMedium',
  long: 'auth.hairLengthLong',
};

export const HAIR_LENGTH_HINT_KEYS: Record<HairLength, TKey> = {
  short: 'auth.hairLengthShortHint',
  medium: 'auth.hairLengthMediumHint',
  long: 'auth.hairLengthLongHint',
};
