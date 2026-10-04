import { useCallback, useEffect, useState } from 'react';
import type { Hairstyle } from '../types';
import { api } from '../utils/api';
import { messageOf } from '../utils/errorMessage';

/** The admin's try-on catalogue, fetched afresh each time a screen that shows
    it mounts.

    Deliberately not cached in a store: the admin adds, switches off and
    deletes styles from the dashboard, and a list kept on the device would go
    on offering a style the admin has already withdrawn. One small request per
    screen is the price of the app never disagreeing with the dashboard. */
export function useHairstyles() {
  const [state, setState] = useState<{
    attempt: number;
    hairstyles: Hairstyle[];
    failed?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.hairstyles
      .list()
      .then((hairstyles) => {
        if (live) setState({ attempt, hairstyles });
      })
      .catch((error: unknown) => {
        if (live) setState({ attempt, hairstyles: [], failed: messageOf(error) });
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const ready = state?.attempt === attempt;

  return {
    hairstyles: ready ? state.hairstyles : [],
    loading: !ready,
    failed: ready ? state.failed : undefined,
    reload,
  };
}
