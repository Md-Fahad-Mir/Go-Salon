import type { HairLength, HairType } from '../../types';
import type { TKey } from '../../i18n';

/* HAIR_TYPES / HAIR_LENGTHS in src/constants carry the ids and the order; the
   words a customer reads live here so both languages stay in step. */

export const HAIR_TYPE_KEYS: Record<HairType, { label: TKey; hint: TKey }> = {
  straight: { label: 'profile.hairStraight', hint: 'profile.hairStraightHint' },
  wavy: { label: 'profile.hairWavy', hint: 'profile.hairWavyHint' },
  curly: { label: 'profile.hairCurly', hint: 'profile.hairCurlyHint' },
  coily: { label: 'profile.hairCoily', hint: 'profile.hairCoilyHint' },
};

export const HAIR_LENGTH_KEYS: Record<HairLength, { label: TKey; hint: TKey }> = {
  short: { label: 'profile.lengthShort', hint: 'profile.lengthShortHint' },
  medium: { label: 'profile.lengthMedium', hint: 'profile.lengthMediumHint' },
  long: { label: 'profile.lengthLong', hint: 'profile.lengthLongHint' },
};
