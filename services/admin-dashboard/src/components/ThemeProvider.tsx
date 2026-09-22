import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyTheme,
  readStoredTheme,
  systemTheme,
  THEME_STORAGE_KEY,
  ThemeContext,
} from '../hooks/useTheme';
import type { Theme } from '../hooks/useTheme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme() ?? systemTheme();
    // index.html already stamped the class to avoid a flash; re-assert it here
    // so the DOM is correct before anything reads a resolved token value.
    applyTheme(initial);
    return initial;
  });
  const [followsSystem, setFollowsSystem] = useState<boolean>(() => readStoredTheme() === null);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
    setFollowsSystem(false);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode — the theme still applies for this session */
    }
  }, []);

  // Keep following the OS until the admin makes an explicit choice.
  useEffect(() => {
    if (!followsSystem) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      const next: Theme = event.matches ? 'dark' : 'light';
      applyTheme(next);
      setThemeState(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [followsSystem]);

  const toggleTheme = useCallback(
    () => setTheme(theme === 'light' ? 'dark' : 'light'),
    [setTheme, theme],
  );

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme, followsSystem }),
    [theme, toggleTheme, setTheme, followsSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
