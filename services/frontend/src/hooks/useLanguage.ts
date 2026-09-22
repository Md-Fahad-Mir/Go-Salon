import { createContext, use } from 'react';
import type { Language, TFunction } from '../i18n';

export interface LanguageState {
  language: Language;
  /** BCP 47 tag for Intl and the document's `lang`. */
  locale: string;
  setLanguage: (language: Language) => void;
  t: TFunction;
}

export const LanguageContext = createContext<LanguageState | null>(null);

export function useLanguage(): LanguageState {
  const context = use(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside <LanguageProvider>.');
  return context;
}

/** The common case: just the translate function. */
export function useT(): TFunction {
  return useLanguage().t;
}
