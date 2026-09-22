/* Reviews, against the Django backend.

   Three calls and two audiences. A customer browsing a salon reads
   `/reviews/listing/{id}/` — every review of that business, because that is
   the question they are asking. Everybody signed in, in any role, reads
   `/reviews/` for *their own* slice: the owner gets their salon's, a stylist
   gets the reviews of work they did, a barber gets their own, a customer gets
   the ones they wrote. The server decides which of those it is, from the
   account on the token.

   The provider app must only ever call `mine()`. `listing()` is public to
   anyone signed in, so pointing a provider screen at it would hand a stylist
   every colleague's reviews through a legitimately-public endpoint, with no
   error and nothing in the logs to notice. Scoping lives on the server; the
   way to keep it is to ask the scoped question. */

import type { Review } from '../types';
import { api } from './apiClient';

export type ReviewSort = 'newest' | 'highest' | 'lowest';

/** The score, the count and the 5-to-1 breakdown, counted over *every* review
    of the business — not over the page that happens to be on screen. */
export interface ReviewSummary {
  /** `null` when nobody has reviewed yet. Not 0: no one has scored it badly,
      no one has scored it at all, and the screens say different things. */
  average: number | null;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ReviewPage {
  reviews: Review[];
  summary: ReviewSummary;
  page: number;
  pages: number;
  count: number;
}

/** What `GET /api/reviews/` adds for a provider: who this account is to the
    rows it just read, and — for an owner only — a score per chair. */
export interface ScopedReviewPage extends ReviewPage {
  viewpoint: 'customer' | 'owner' | 'barber' | 'employee' | 'none';
  byStaff: Array<{ employeeId: string; rating: number; reviewCount: number }>;
}

/** One review as the server sends it. Exported because an appointment
    carries its own review inline, and `bookingService` maps that. */
export interface ApiReview {
  id: number;
  professional_id: string;
  professional_name: string;
  booking_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  text: string;
  service_name: string;
  staff_name: string;
  reply: string;
  replied_at: string | null;
  replied_by_name: string;
  can_reply: boolean;
  created_at: string;
}

interface ApiReviewPage {
  results: ApiReview[];
  summary: ReviewSummary;
  page: number;
  pages: number;
  count: number;
  viewpoint?: ScopedReviewPage['viewpoint'];
  by_staff?: Array<{ employee_id: string; rating: number; review_count: number }>;
}

export const toReview = (row: ApiReview): Review => ({
  id: String(row.id),
  professionalId: row.professional_id,
  professionalName: row.professional_name,
  bookingId: row.booking_id,
  userId: row.user_id,
  userName: row.user_name,
  rating: row.rating,
  text: row.text,
  createdAt: row.created_at,
  serviceName: row.service_name || undefined,
  staffName: row.staff_name || undefined,
  reply: row.reply,
  repliedAt: row.replied_at,
  repliedByName: row.replied_by_name,
  canReply: row.can_reply,
});

const toPage = (data: ApiReviewPage): ReviewPage => ({
  reviews: data.results.map(toReview),
  summary: data.summary,
  page: data.page,
  pages: data.pages,
  count: data.count,
});

const query = (sort: ReviewSort, page: number): string =>
  `?sort=${sort}${page > 1 ? `&page=${page}` : ''}`;

export const reviewService = {
  /** One business's reviews, as a customer deciding where to go reads them. */
  async listing(professionalId: string, sort: ReviewSort = 'newest', page = 1): Promise<ReviewPage> {
    const data = await api.get<ApiReviewPage>(
      `/reviews/listing/${encodeURIComponent(professionalId)}/${query(sort, page)}`,
    );
    return toPage(data);
  },

  /** The reviews this account is entitled to — see the note at the top. */
  async mine(sort: ReviewSort = 'newest', page = 1): Promise<ScopedReviewPage> {
    const data = await api.get<ApiReviewPage>(`/reviews/${query(sort, page)}`);
    return {
      ...toPage(data),
      viewpoint: data.viewpoint ?? 'none',
      byStaff: (data.by_staff ?? []).map((row) => ({
        employeeId: row.employee_id,
        rating: row.rating,
        reviewCount: row.review_count,
      })),
    };
  },

  /** Rating a finished visit. The booking decides the business, the service
      and the stylist, so none of them is sent. */
  async create(bookingId: string, input: { rating: number; text?: string }): Promise<Review> {
    const row = await api.post<ApiReview>(`/reviews/booking/${bookingId}/`, {
      rating: input.rating,
      text: input.text ?? '',
    });
    return toReview(row);
  },

  /** The business answering one. */
  async reply(bookingId: string, reply: string): Promise<Review> {
    const row = await api.patch<ApiReview>(`/reviews/booking/${bookingId}/`, { reply });
    return toReview(row);
  },
};
