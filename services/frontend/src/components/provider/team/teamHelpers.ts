import { addDays, startOfWeek } from 'date-fns';
import { HAIR_LENGTHS, HAIR_TYPES, LOOKBOOK_CATEGORIES, WEEKDAYS } from '../../../constants';
import type { TranslationKey } from '../../../i18n';
import type { HairLength, HairType, Weekday } from '../../../types';
import { formatPattern } from '../../../utils/format';

/* Small pieces the employee's and the stylist's screens both lean on. Kept
   here rather than in shared code because only these two roles need them. */

/* --- Weekdays -------------------------------------------------------------- */

/** date-fns already carries Bangla weekday names, so the shift week reads
    রবিবার / সোমবার without a dictionary key per day. */
export const weekdayLabel = (day: Weekday, pattern: 'EEEE' | 'EEE' = 'EEEE'): string =>
  formatPattern(addDays(startOfWeek(new Date()), WEEKDAYS.indexOf(day)), pattern);

export const weekdayOf = (date: Date): Weekday => WEEKDAYS[date.getDay()];

/* --- Clock ----------------------------------------------------------------- */

/** "14:30" -> 870. Returns 0 for anything unparseable. */
export const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
};

export const minutesNow = (date = new Date()): number => date.getHours() * 60 + date.getMinutes();

/* --- Chair status ---------------------------------------------------------- */

/* --- Hair vocabulary -------------------------------------------------------- */

/* The ids and their order come from the customer app's constants; the words a
   stylist reads live in this slice so both languages stay in step. */
const HAIR_TYPE_KEYS: Record<HairType, TranslationKey> = {
  straight: 'pt.hairStraight',
  wavy: 'pt.hairWavy',
  curly: 'pt.hairCurly',
  coily: 'pt.hairCoily',
};

const HAIR_LENGTH_KEYS: Record<HairLength, TranslationKey> = {
  short: 'pt.lengthShort',
  medium: 'pt.lengthMedium',
  long: 'pt.lengthLong',
};

export const hairTypeKey = (id: HairType): TranslationKey =>
  HAIR_TYPE_KEYS[HAIR_TYPES.find((entry) => entry.id === id)?.id ?? 'straight'];

export const hairLengthKey = (id: HairLength): TranslationKey =>
  HAIR_LENGTH_KEYS[HAIR_LENGTHS.find((entry) => entry.id === id)?.id ?? 'short'];

/* --- Lookbook categories ---------------------------------------------------- */

const CATEGORY_KEYS: Record<string, TranslationKey> = {
  Bridal: 'pt.catBridal',
  Layers: 'pt.catLayers',
  Colouring: 'pt.catColouring',
  'Hair care': 'pt.catHairCare',
};

/** Falls back to the stored English category for anything the stylist typed
    herself, which is the right behaviour for user content. */
export const categoryKey = (category: string): TranslationKey | null =>
  CATEGORY_KEYS[category] ?? null;

export const LOOKBOOK_TONES = [0, 1, 2, 3, 4, 5];

export { LOOKBOOK_CATEGORIES };
