import { useEffect, useState } from 'react';

/** A clock that re-renders on its own.

    The queue is left open all day, so "in the chair for 25 min" and "starts in
    10 min" have to move without anyone touching the screen. The state is set
    inside the interval callback — never in the effect body — so the first
    paint is derived, not scheduled. */
export function useTicker(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);

  return now;
}
