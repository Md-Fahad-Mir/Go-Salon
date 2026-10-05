import { useEffect, useState } from "react";
import { API_BASE_URL, FALLBACK_TIERS } from "../constants";

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
        if (Array.isArray(rows) && rows.length) setTiers(rows);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return tiers;
};
