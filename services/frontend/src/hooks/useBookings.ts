import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../utils/api';
import type { BookingList } from '../utils/bookingService';
import { messageOf } from '../utils/errorMessage';

/** Whoever is signed in, and their appointments.

    The same endpoint answers every role — the server scopes it — so a
    customer's list, an owner's salon-wide diary and an employee's own chair
    all come from here. `viewpoint` says which of those came back, and the
    screens read it rather than guessing from the role. */
export function useBookings(filters: { date?: string; upcoming?: boolean } = {}) {
  const setBookings = useAppStore((s) => s.setBookings);
  const bookings = useAppStore((s) => s.bookings);
  const [state, setState] = useState<{
    key: string;
    viewpoint: BookingList['viewpoint'];
    failed?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const key = [filters.date ?? '', filters.upcoming ? 'upcoming' : '', attempt].join('|');

  useEffect(() => {
    let live = true;
    api.bookings
      .list({ date: filters.date, upcoming: filters.upcoming })
      .then((result) => {
        if (!live) return;
        setBookings(result.bookings);
        setState({ key, viewpoint: result.viewpoint });
      })
      .catch((error: unknown) => {
        if (live) setState({ key, viewpoint: 'none', failed: messageOf(error) });
      });
    return () => {
      live = false;
    };
  }, [key, filters.date, filters.upcoming, setBookings]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const ready = state?.key === key;

  return {
    bookings,
    viewpoint: ready ? state.viewpoint : 'none',
    loading: !ready,
    failed: ready ? state.failed : undefined,
    reload,
  };
}
