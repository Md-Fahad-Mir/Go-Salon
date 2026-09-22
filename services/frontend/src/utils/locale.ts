import { bn as bnDates, enGB } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import type { Language } from '../i18n';
import { LOCALES } from '../i18n';

/* The formatting helpers in utils/format.ts are plain functions called from
   everywhere, so the active language lives here as module state rather than
   being threaded through every call site. LanguageProvider keeps it in step
   with React, and re-renders on a language change already redraw the strings. */

let activeLanguage: Language = 'en';

const DATE_LOCALES: Record<Language, Locale> = { en: enGB, bn: bnDates };

export const setActiveLanguage = (language: Language): void => {
  activeLanguage = language;
};

export const getActiveLanguage = (): Language => activeLanguage;

/** BCP 47 tag for Intl. */
export const activeLocale = (): string => LOCALES[activeLanguage];

/** date-fns locale, so month and weekday names translate. */
export const activeDateLocale = (): Locale => DATE_LOCALES[activeLanguage];

/** Bangla renders digits in Bengali numerals; English keeps Western ones. */
export const activeNumberLocale = (): string => (activeLanguage === 'bn' ? 'bn-BD' : 'en-US');
