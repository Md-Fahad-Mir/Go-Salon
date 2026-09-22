import type { GeoPoint } from '../types';

const EARTH_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export const distanceKm = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
};

export const directionsUrl = (point: GeoPoint): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;

export const mapsSearchUrl = (label: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
