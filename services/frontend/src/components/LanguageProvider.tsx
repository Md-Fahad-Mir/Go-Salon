import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STORAGE_KEYS } from '../constants';
import { LanguageContext } from '../hooks/useLanguage';
import { LOCALES, translator, type Language } from '../i18n';
import { setActiveLanguage } from '../utils/locale';
import { safeLocal } from '../utils/storage';

const readLanguage = (): Language => {
  const saved = safeLocal.get<string>(STORAGE_KEYS.language, '');
  if (saved === 'en' || saved === 'bn') return saved;
  // No choice yet: follow the phone. A Bangla handset gets Bangla.
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bn')) {
    return 'bn';
  }
  return 'en';
};

// The formatting helpers read module state, so set it before the first render
// rather than in an effect — otherwise the first paint formats in English.
setActiveLanguage(readLanguage());

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readLanguage);

  useEffect(() => {
    setActiveLanguage(language);
    const root = document.documentElement;
    root.setAttribute('lang', LOCALES[language]);
    // Bangla script sits taller than Latin, so it gets a little more leading.
    root.dataset.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setActiveLanguage(next);
    setLanguageState(next);
    safeLocal.set(STORAGE_KEYS.language, next);
  }, []);

  const value = useMemo(
    () => ({ language, locale: LOCALES[language], setLanguage, t: translator(language) }),
    [language, setLanguage],
  );

  return <LanguageContext value={value}>{children}</LanguageContext>;
}
