import { useEffect, useState } from "react";
import { API_BASE_URL, FALLBACK_TIERS } from "../constants";

/** A plan as /subscription-tiers/ returns it, with its prices as numbers.
    An API from before plans had currencies sends `price_bdt` alone; that
    reads as a taka price, so this page and the API can be deployed in
    either order. */
const toTier = (row) => ({
  ...row,
  currency: row.currency ?? "BDT",
  price: Number(row.price ?? row.price_bdt ?? 0),
  other_prices: (row.other_prices ?? []).map((price) => ({ ...price, amount: Number(price.amount) })),
});

/** The subscription plans, live from the public `/subscription-tiers/`
    endpoint when an API is configured, so edits made in the admin dashboard
    show up here too. Falls back to the seeded plans on any failure. */
export const useTiers = () => {
  const [tiers, setTiers] = useState(FALLBACK_TIERS);

  useEffect(() => {
    if (!API_BASE_URL) return;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/subscription-tiers/`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((rows) => {
        if (Array.isArray(rows) && rows.length) setTiers(rows.map(toTier));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return tiers;
};
