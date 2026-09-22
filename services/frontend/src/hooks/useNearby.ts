import { useEffect, useState } from 'react';
import type { Audience, GeoPoint } from '../types';
import { api, type NearbyProfessional } from '../utils/api';

interface Result {
  key: string;
  list: NearbyProfessional[];
  failed?: boolean;
}

/** Nearby professionals, sorted by distance from a point.

    `loading` is true until the result for the *current* point has arrived,
    and `failed` says the request did not come back — an empty list and a
    broken connection are different things and the screens say so. */
export function useNearby(point: GeoPoint, limit = 10, audience?: Audience | 'all') {
  const { lat, lng } = point;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${limit},${audience ?? 'any'}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let active = true;
    api.professionals
      .nearby({ lat, lng }, limit, audience)
      .then((list) => {
        if (active) setResult({ key, list });
      })
      .catch(() => {
        if (active) setResult({ key, list: [], failed: true });
      });
    return () => {
      active = false;
    };
  }, [key, lat, lng, limit, audience]);

  const ready = result?.key === key;
  return {
    list: ready ? result.list : [],
    loading: !ready,
    failed: ready ? Boolean(result.failed) : false,
  };
}
