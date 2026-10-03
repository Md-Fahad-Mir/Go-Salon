import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../utils/apiError';

interface AsyncListState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

const messageFor = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Could not reach the server.';

/** Fetches a full list once, client-side search/sort/pagination (via
    useTableState) take it from there. Mutations call `refetch` to resync
    rather than patching local state, so the table never drifts from the
    server. */
export function useAsyncList<T>(fetcher: () => Promise<T[]>) {
  const [state, setState] = useState<AsyncListState<T>>({ data: [], loading: true, error: null });

  const refetch = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    fetcher()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: [], loading: false, error: messageFor(error) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The mount-time fetch, kept separate from `refetch`'s synchronous
    // loading-flag reset: that reset only belongs to a refetch a user
    // action triggers, not the first render, which already starts with
    // loading: true in the initial state above.
    fetcher()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: [], loading: false, error: messageFor(error) }));
    // Runs once on mount; `refetch` is what later mutations call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, refetch };
}
