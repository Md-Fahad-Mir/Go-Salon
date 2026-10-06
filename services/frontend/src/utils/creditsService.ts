/* Try-on credits and the plans that grant them, from the backend.

   The app never keeps its own count: a credit is spent by the backend when it
   starts a video, handed back when one fails, and every screen that shows the
   balance reads it again rather than adjusting a copy. */

import { parseISO } from 'date-fns';
import type { SubscriptionPlan, TryOnCredits } from '../types';
import { api } from './apiClient';
import { formatPattern } from './format';

/** `Apps/tryon/credits.py` — `summary()`. */
export interface ApiCredits {
  plan: { slug: string; name: string };
  total: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  period_start: string;
  resets_at: string;
}

interface ApiPlan {
  slug: string;
  name: string;
  currency: string;
  /** Decimal strings, as DRF sends them: "500.00". */
  price: string;
  other_prices: { currency: string; amount: string }[];
  monthly_credits: number | null;
  features: string[];
  is_featured: boolean;
  is_default: boolean;
}

export const toCredits = (row: ApiCredits): TryOnCredits => ({
  plan: { slug: row.plan.slug, name: row.plan.name },
  total: row.total,
  used: row.used,
  remaining: row.remaining,
  resetsAt: row.resets_at,
});

const toPlan = (row: ApiPlan): SubscriptionPlan => ({
  slug: row.slug,
  name: row.name,
  price: { currency: row.currency, amount: Number(row.price) },
  otherPrices: row.other_prices.map((price) => ({ currency: price.currency, amount: Number(price.amount) })),
  monthlyCredits: row.monthly_credits,
  features: row.features,
  featured: row.is_featured,
});

/** Whether one more try-on fits. A balance not yet read is let through: the
    backend has the final say, and refuses with `no_credits` if it must. */
export const canSpend = (credits: TryOnCredits | undefined): boolean =>
  !credits || credits.remaining === null || credits.remaining > 0;

/** The date the month's credits start over, as the backend's calendar has it.
    Only the date part is read, so a phone set to another time zone still
    names the same day. */
export const renewsOn = (credits: TryOnCredits): string =>
  formatPattern(parseISO(credits.resetsAt.slice(0, 10)), 'd MMM');

export const creditsService = {
  /** `GET /api/tryon/credits/` — the plan and this month's balance. */
  get: async (): Promise<TryOnCredits> => toCredits(await api.get<ApiCredits>('/tryon/credits/')),

  /** `GET /api/subscription-tiers/` — every plan, in the admin's order. */
  plans: async (): Promise<SubscriptionPlan[]> =>
    (await api.get<ApiPlan[]>('/subscription-tiers/', { anonymous: true })).map(toPlan),
};
