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

  /* !! READ BEFORE CHANGING THE DEPENDENCIES OR THE SWITCHER !!

     `activeTenantId` is NOT a dependency here, and yet this list is correct
     after a customer switches salons. That is not because anything reacts:
     it is because `SalonSection.choose()` navigates to Home with `replace`,
     which unmounts whatever screen was calling this, and the next mount runs
     the effect afresh under the new `X-Tenant-Id`. Correctness on a switch
     currently rests on that navigation and on nothing else.

     So: remove or soften that navigate — "switching should not jump screens"
     is an easy wish — and this hook keeps serving the previous salon's
     bookings, silently, with no failed request to point at. The same is true
     of any tenant change that does not navigate: `loadTenants` settling the
     persisted id at start-up, or `removeTenant` dropping the active salon.

     The honest fix is to depend on the tenant and to tag each answer with the
     id it was asked under, so a late reply cannot overwrite a newer salon's
     list. That is FR4's; this note is here so nobody has to rediscover why. */
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
