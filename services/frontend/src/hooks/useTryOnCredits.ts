import { useCallback, useEffect } from 'react';
import type { TryOnCredits } from '../types';
import { useAppStore } from '../store/useAppStore';
import { creditsService } from '../utils/creditsService';

/** The account's plan and this month's credits, read again from the backend
    each time a screen that shows them opens — a new month, a plan the admin
    has just changed, or a video that failed and gave its credit back are all
    the server's to know. Until the first answer the last known balance shows,
    and `credits` is undefined only before there has ever been one. */
export function useTryOnCredits(): { credits: TryOnCredits | undefined; refresh: () => Promise<void> } {
  const credits = useAppStore((s) => s.user?.tryOnCredits);
  const setTryOnCredits = useAppStore((s) => s.setTryOnCredits);

  const refresh = useCallback(async () => {
    try {
      setTryOnCredits(await creditsService.get());
    } catch {
      // Keep the last known balance; the backend still enforces the real one.
    }
  }, [setTryOnCredits]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { credits, refresh };
}
