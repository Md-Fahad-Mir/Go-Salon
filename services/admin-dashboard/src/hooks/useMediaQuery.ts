import { useCallback, useSyncExternalStore } from 'react';
import { MEDIA_QUERIES } from '../constants/breakpoints';

/** Subscribes to a media query so layout logic that CSS cannot express
    (e.g. whether the drawer should be dismissible) stays in sync. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const useIsDesktop = (): boolean => useMediaQuery(MEDIA_QUERIES.lg);
export const useIsTablet = (): boolean => useMediaQuery(MEDIA_QUERIES.md);
