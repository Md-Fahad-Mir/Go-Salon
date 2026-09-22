import { useCallback, useEffect, useState } from 'react';
import {
  reviewService,
  type ReviewPage,
  type ReviewSort,
  type ScopedReviewPage,
} from '../utils/reviewService';
import { messageOf } from '../utils/errorMessage';

/** Reviews, from the server, for the two questions the app asks.

    `loading` stays true until the answer for the *current* question has come
    back, and `failed` carries the message when it did not — an empty list and
    a request that never landed look the same on screen otherwise, and the
    difference is the whole point of an empty state.

    Every summary figure on screen comes from `summary`, which the server
    counted over the whole business. Averaging the page that happens to be
    loaded would quietly report the mean of the twenty newest reviews. */

interface State<T> {
  key: string;
  page?: T;
  failed?: string;
}

function useReviewPage<T extends ReviewPage>(key: string, fetch: () => Promise<T>) {
  const [state, setState] = useState<State<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const full = `${key}|${attempt}`;

  useEffect(() => {
    let live = true;
    fetch()
      .then((page) => {
        if (live) setState({ key: full, page });
      })
      .catch((error: unknown) => {
        if (live) setState({ key: full, failed: messageOf(error) });
      });
    return () => {
      live = false;
    };
    // `fetch` is rebuilt every render by design; `full` is what identifies the
    // question being asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const ready = state?.key === full;
  return {
    page: ready ? state.page : undefined,
    loading: !ready,
    failed: ready ? state.failed : undefined,
    reload,
  };
}

/** One business's reviews — what a customer reads before booking. */
export function useListingReviews(professionalId: string, sort: ReviewSort = 'newest', page = 1) {
  const result = useReviewPage<ReviewPage>(
    `listing:${professionalId}:${sort}:${page}`,
    () => reviewService.listing(professionalId, sort, page),
  );
  return {
    reviews: result.page?.reviews ?? [],
    summary: result.page?.summary,
    pages: result.page?.pages ?? 1,
    count: result.page?.count ?? 0,
    loading: result.loading,
    failed: result.failed,
    reload: result.reload,
  };
}

/** The reviews this account is entitled to. The server decides which those
    are from the token, so a provider screen never has to — and must never
    reach for the listing endpoint to widen them. */
export function useMyReviews(sort: ReviewSort = 'newest', page = 1) {
  const result = useReviewPage<ScopedReviewPage>(
    `mine:${sort}:${page}`,
    () => reviewService.mine(sort, page),
  );
  return {
    reviews: result.page?.reviews ?? [],
    summary: result.page?.summary,
    viewpoint: result.page?.viewpoint ?? 'none',
    byStaff: result.page?.byStaff ?? [],
    pages: result.page?.pages ?? 1,
    count: result.page?.count ?? 0,
    loading: result.loading,
    failed: result.failed,
    reload: result.reload,
  };
}
