/* The customer-facing directory: who a customer can book, from the backend.

   One salon comes out of `/api/listings/` in one
   shape, so a search result and a detail page are the same record with more
   of it filled in. There is no fixture behind any of this — a listing exists
   because somebody finished signing up for it. */

import type {
  AcceptanceMode,
  Audience,
  BusinessType,
  GalleryPhoto,
  GeoPoint,
  Professional,
  Service,
  StaffMember,
} from '../types';
import type { WeekSchedule } from '../types/schedule';
import { api } from './apiClient';
import { hashUnit } from './id';

/* --- What the wire looks like --------------------------------------------- */

interface ApiLocation {
  area: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface ApiDay {
  day: WeekSchedule[number]['day'];
  is_closed: boolean;
  intervals: Array<{ start: string; end: string }>;
}

interface ApiService {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  buffer_minutes: number;
  audience: 'all' | 'male' | 'female';
  includes: string[];
  steps: string[];
  popular: boolean;
  eligible_employee_ids: string[];
}

interface ApiStaff {
  id: string;
  name: string;
  title: string;
  avatar: string;
  specialties: string[];
  experience_years: number;
  chair_status: string;
  /** This chair's own score: the mean of the reviews of work done in it, and
      null when there are none. */
  rating: number | null;
  review_count: number;
  /** This chair's effective week: its own hours, or the salon's when it has
      set none. Resolved server-side, the same way booking resolves it. */
  hours: ApiDay[];
}

interface ApiListing {
  id: string;
  kind: 'salon' | 'barber';
  type: BusinessType;
  name: string;
  tagline: string;
  bio: string;
  audience: Audience;
  avatar: string;
  cover_image: string;
  gallery: Array<{ id: number; image: string; caption: string }>;
  location: ApiLocation;
  distance_km: number | null;
  phone: string;
  email: string;
  category: string;
  specialties: string[];
  experience_years: number | null;
  verified: boolean;
  accepting_clients: boolean;
  acceptance: AcceptanceMode;
  amenities: string[];
  women_only: boolean;
  private_booth: boolean;
  price_from: number | null;
  service_count: number;
  staff_count: number;
  hours: ApiDay[];
  open_now: boolean;
  rating: number | null;
  review_count: number;
  services?: ApiService[];
  staff?: ApiStaff[];
}


/* --- Mapping -------------------------------------------------------------- */

const toGallery = (rows: ApiListing['gallery']): GalleryPhoto[] =>
  rows.map((row) => ({ id: row.id, image: row.image, caption: row.caption }));

const toWeek = (days: ApiDay[]): WeekSchedule =>
  days.map((day) => ({
    day: day.day,
    closed: day.is_closed,
    intervals: day.intervals.map((interval) => ({ ...interval })),
  }));

export function toProfessional(row: ApiListing): Professional {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    type: row.type,
    audience: row.audience,
    tagline: row.tagline,
    bio: row.bio,
    location: {
      area: row.location.area,
      city: row.location.city,
      address: row.location.address,
      lat: row.location.latitude ?? 0,
      lng: row.location.longitude ?? 0,
    },
    phone: row.phone,
    email: row.email,
    avatar: row.avatar,
    coverImage: row.cover_image,
    gallery: toGallery(row.gallery),
    category: row.category,
    specialties: row.specialties ?? [],
    experienceYears: row.experience_years,
    rating: row.rating,
    reviewCount: row.review_count,
    hours: toWeek(row.hours),
    openNow: row.open_now,
    acceptance: row.acceptance,
    priceFrom: row.price_from,
    serviceCount: row.service_count,
    staffCount: row.staff_count,
    verified: row.verified,
    acceptingClients: row.accepting_clients,
    womenOnly: row.women_only,
    privateBooth: row.private_booth,
    amenities: row.amenities ?? [],
    distanceKm: row.distance_km ?? undefined,
  };
}

/** `suitableFor` on the customer side and `audience` on the provider's are the
    same fact in two vocabularies. */
const SUITS = { all: 'all', male: 'men', female: 'women' } as const;

export const toService = (row: ApiService, professionalId: string): Service => ({
  id: row.id,
  professionalId,
  name: row.name,
  category: row.category,
  duration: row.duration,
  price: row.price,
  description: row.description,
  includes: row.includes ?? [],
  suitableFor: SUITS[row.audience] ?? 'all',
  // Hairstyles are a catalogue of their own with no backend link to a price
  // list yet, so nothing here claims to match a try-on.
  hairstyleIds: [],
  // Already on the wire and previously dropped here, which is why the customer
  // side could not tell which stylist may perform what.
  staffIds: (row.eligible_employee_ids ?? []).map(String),
  popular: row.popular,
});

export const toStaff = (row: ApiStaff, professionalId: string): StaffMember => ({
  id: row.id,
  professionalId,
  name: row.name,
  title: row.title,
  rating: row.rating ?? null,
  reviewCount: row.review_count ?? 0,
  specialties: row.specialties ?? [],
  experienceYears: row.experience_years,
  tone: Math.floor(hashUnit(`${professionalId}:${row.id}`) * 6),
  // The week this chair actually works. The server has already applied the
  // inheritance — own hours, else the salon's — so the calendar can ask about
  // one stylist without re-deriving the rule and getting it wrong.
  hours: toWeek(row.hours),
  // Days off are the fixtures' way of saying the same thing; a real chair
  // closes the day in `hours` instead.
  daysOff: [],
});

export interface DirectoryDetail {
  professional: Professional;
  services: Service[];
  staff: StaffMember[];
}

/* --- Calls ---------------------------------------------------------------- */

/** The only query this endpoint still takes: where the caller is, so the
    listing can report a distance. The filter set went with the browsable
    directory — there is nothing to filter when the answer is one salon. */
const queryString = (point: GeoPoint | undefined): string =>
  point ? `?lat=${point.lat}&lng=${point.lng}` : '';

export const directoryService = {
  async get(id: string, point?: GeoPoint): Promise<DirectoryDetail> {
    // `/listings/`, not `/directory/`: the browsable directory is gone and the
    // path went with it. This one read survives because the booking wizard has
    // no other source for a salon's menu, chairs, address or phone — and it is
    // membership-scoped now, so it answers 404 for a salon you have not joined.
    const row = await api.get<ApiListing>(`/listings/${id}/${queryString(point)}`);
    return {
      professional: toProfessional(row),
      services: (row.services ?? []).map((service) => toService(service, row.id)),
      staff: (row.staff ?? []).map((member) => toStaff(member, row.id)),
    };
  },
};
