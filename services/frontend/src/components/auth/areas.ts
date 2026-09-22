import type { TFunction, TKey } from '../../i18n';
import type { GeoPoint, Location } from '../../types';
import { DEFAULT_LOCATION, DHAKA_AREAS } from '../../constants';
import { distanceKm } from '../../utils/geo';

export type DhakaArea = (typeof DHAKA_AREAS)[number];

/** Dhaka place names read in Bengali script for a Bangla reader, so the area
    chips and the "near {area}" lines translate while the stored Location keeps
    the English key the data layer uses. */
export const AREA_KEYS: Record<DhakaArea, TKey> = {
  Dhanmondi: 'home.areaDhanmondi',
  Gulshan: 'home.areaGulshan',
  Banani: 'home.areaBanani',
  Uttara: 'home.areaUttara',
  Mirpur: 'home.areaMirpur',
  Bashundhara: 'home.areaBashundhara',
  Mohammadpur: 'home.areaMohammadpur',
  'Old Dhaka': 'home.areaOldDhaka',
};

/** Translated area name, falling back to the raw name for anywhere unlisted. */
export const areaLabel = (t: TFunction, area: string): string =>
  isDhakaArea(area) ? t(AREA_KEYS[area]) : area;

/** Approximate centres for each pickable area. Dhanmondi uses the app default. */
export const AREA_CENTRES: Record<DhakaArea, GeoPoint> = {
  Dhanmondi: { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng },
  Gulshan: { lat: 23.7925, lng: 90.4078 },
  Banani: { lat: 23.7937, lng: 90.4066 },
  Uttara: { lat: 23.8759, lng: 90.3795 },
  Mirpur: { lat: 23.8069, lng: 90.3687 },
  Bashundhara: { lat: 23.8148, lng: 90.427 },
  Mohammadpur: { lat: 23.7625, lng: 90.3585 },
  'Old Dhaka': { lat: 23.7104, lng: 90.4074 },
};

export const isDhakaArea = (value: string): value is DhakaArea =>
  (DHAKA_AREAS as readonly string[]).includes(value);

/** The Location record saved when someone picks an area chip. */
export const areaLocation = (area: DhakaArea): Location => ({
  ...AREA_CENTRES[area],
  area,
  city: 'Dhaka',
  address: `${area}, Dhaka`,
});

/** Closest known area to a GPS fix, so "near you" still reads as a place. */
export const nearestArea = (point: GeoPoint): DhakaArea =>
  DHAKA_AREAS.reduce<DhakaArea>(
    (best, area) => (distanceKm(point, AREA_CENTRES[area]) < distanceKm(point, AREA_CENTRES[best]) ? area : best),
    DHAKA_AREAS[0],
  );

/** The Location record saved from a device fix. */
export const locationFromPoint = (point: GeoPoint): Location => {
  const area = nearestArea(point);
  return { lat: point.lat, lng: point.lng, area, city: 'Dhaka', address: `Near ${area}, Dhaka` };
};
