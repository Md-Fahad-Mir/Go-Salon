import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Where each history entry was scrolled to when it was left.
 *
 *  Keyed on the history entry's `key`, not its path: `/search` visited twice
 *  is two entries with two positions, which is what Back actually means. Kept
 *  in sessionStorage so a reload mid-session does not lose it, and dropped
 *  when the tab closes — the same lifetime the history itself has. */
const STORE_KEY = 'eureka.scroll';

const read = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
};

/** Plenty for any real back-stack. Replacing the URL — which the search
    screen does on every keystroke — mints a fresh history key each time, so
    without a cap the oldest entries would pile up unread for the session. */
const KEEP = 50;

const write = (positions: Record<string, number>) => {
  const entries = Object.entries(positions);
  const kept = entries.length > KEEP ? entries.slice(entries.length - KEEP) : entries;
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* private mode or quota: scrolling still works, it just forgets */
  }
};

/** How long to keep trying to restore, in milliseconds.
 *
 *  A restored page is short before its data lands — lazy chunk, then a search
 *  request — so scrolling to the saved offset immediately lands at the bottom
 *  of a skeleton. This re-applies it each frame until the page is tall enough
 *  to hold it, then stops. */
const RESTORE_WINDOW = 1200;

export function ScrollToTop() {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const leaving = useRef(key);

  useEffect(() => {
    // The browser's own restoration races this one and loses either way.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    const previous = leaving.current;
    leaving.current = key;
    if (previous !== key) write({ ...read(), [previous]: window.scrollY });

    if (navigationType !== 'POP') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }

    const target = read()[key] ?? 0;
    if (!target) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }

    let frame = 0;
    const deadline = Date.now() + RESTORE_WINDOW;
    const settle = () => {
      window.scrollTo({ top: target, left: 0, behavior: 'instant' as ScrollBehavior });
      // Stop as soon as the page is tall enough to actually hold the offset,
      // otherwise keep trying while the rest of it arrives.
      const reached = Math.abs(window.scrollY - target) < 2;
      if (!reached && Date.now() < deadline) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [key, navigationType]);

  /* A reload is not a route change, so the effect above never sees it. */
  useEffect(() => {
    const remember = () => write({ ...read(), [leaving.current]: window.scrollY });
    window.addEventListener('pagehide', remember);
    return () => window.removeEventListener('pagehide', remember);
  }, []);

  return null;
}
