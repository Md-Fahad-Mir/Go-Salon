import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STORAGE_KEYS, THEME_COLORS } from '../constants';
import {
  ThemeContext,
  resolveTheme,
  type ThemePreference,
  type ResolvedTheme,
} from '../hooks/useTheme';
import { safeLocal } from '../utils/storage';

const readPreference = (): ThemePreference => {
  const saved = safeLocal.get<string>(STORAGE_KEYS.theme, 'system');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
};

/** Paints the mood on <html> and keeps the browser chrome in step. The same
    work happens in an inline script in index.html so the first frame is already
    correct; this keeps it true afterwards. */
const applyTheme = (theme: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.toggle('dark-theme', theme === 'dark');
  root.classList.toggle('light-theme', theme === 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readPreference()));

  // Follow the OS for as long as the user has not chosen a side.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => setResolved(event.matches ? 'light' : 'dark');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolved(resolveTheme(next));
    safeLocal.set(STORAGE_KEYS.theme, next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
