/* The signed-in account's own profile, and the pictures that go with it.

   One endpoint answers for all four roles — `/profile/me/` returns the same
   envelope with the parts that do not apply left null — so the app has one
   call and one mapping rather than four of each. */

import type {
  Audience,
  BusinessType,
  Gender,
  HairLength,
  HairType,
  Location,
  User,
} from '../types';
import type {
  ExperienceRange,
  GalleryImage,
  ProviderProfile,
  ProviderRole,
} from '../types/provider';
import { api } from './apiClient';

/* --- What the wire looks like --------------------------------------------- */

interface ApiLocation {
  area: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface ApiAccount {
  id: number;
  phone: string;
  name: string;
  email: string;
  role: ProviderRole | 'customer' | 'admin';
  is_phone_verified: boolean;
  try_on_credits: number;
  date_joined: string;
}

interface ApiCustomer {
  avatar: string;
  gender: Gender | '';
  hair_type: HairType | '';
  hair_length: HairLength | '';
  location: ApiLocation;
}

interface ApiGalleryImage {
  id: number;
  image: string;
  caption: string;
  sort_order: number;
  created_at: string;
}

interface ApiBarber {
  audience: Audience;
  business_name: string;
  display_name: string;
  title: string;
  bio: string;
  avatar: string;
  cover_image: string;
  category_id: number | null;
  category_name: string | null;
  experience_years: number;
  experience_range: ExperienceRange;
  specialties: string[];
  contact_phone: string;
  contact_email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  accepting_clients: boolean;
  auto_accept: boolean;
  service_ids: string[];
  location: ApiLocation;
  gallery: ApiGalleryImage[];
}

interface ApiSalon {
  id: number;
  name: string;
  business_type: BusinessType;
  audience: Audience;
  tagline: string;
  bio: string;
  avatar: string;
  cover_image: string;
  business_phone: string;
  contact_email: string;
  verification: ProviderProfile['verification'];
  amenities: string[];
  women_only: boolean;
  private_booth: boolean;
  auto_accept: boolean;
  location: ApiLocation;
  gallery: ApiGalleryImage[];
  employee_count: number;
  created_at: string;
}

interface ApiEmployment {
  id: number;
  salon: number;
  salon_name: string;
  salon_audience: Audience;
  title: string;
  commission_rate: number;
  chair_status: string;
  is_active: boolean;
  created_at: string;
}

export interface ApiProfile {
  role: ApiAccount['role'];
  account: ApiAccount;
  customer: ApiCustomer | null;
  barber: ApiBarber | null;
  salon: ApiSalon | null;
  employment: ApiEmployment | null;
}

/* --- Mapping -------------------------------------------------------------- */

const toLocation = (value: ApiLocation | undefined): Location => ({
  area: value?.area ?? '',
  city: value?.city ?? '',
  address: value?.address ?? '',
  lat: value?.latitude ?? 0,
  lng: value?.longitude ?? 0,
});

const toGallery = (rows: ApiGalleryImage[] | undefined): GalleryImage[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    image: row.image,
    caption: row.caption,
    sortOrder: row.sort_order,
  }));

/** The customer-shaped `User` the app has always carried around. */
export function toUser(profile: ApiProfile): User {
  const { account, customer, barber } = profile;
  return {
    id: String(account.id),
    name: account.name,
    role: account.role,
    audience: barber?.audience,
    isPhoneVerified: account.is_phone_verified,
    gender: customer?.gender || undefined,
    phone: account.phone,
    email: account.email || undefined,
    avatar: customer?.avatar || barber?.avatar || undefined,
    hairType: customer?.hair_type || undefined,
    hairLength: customer?.hair_length || undefined,
    location: customer?.location ? toLocation(customer.location) : undefined,
    createdAt: account.date_joined,
    credits: account.try_on_credits,
  };
}

/** The professional's business, however their role holds it.

    An owner's business *is* the salon. A barber's is their own trade record.
    An employee has both — their trade, in a room somebody else owns — so the
    two are merged with the salon supplying the shopfront and the person
    supplying the hands. */
export function toProviderProfile(profile: ApiProfile): ProviderProfile | null {
  const { account, barber, salon, employment } = profile;
  if (account.role === 'customer' || account.role === 'admin') return null;

  const role = account.role as ProviderRole;
  const isOwner = role === 'salon_owner';
  if (isOwner && !salon) return null;
  if (!isOwner && !barber) return null;

  const source = isOwner ? salon! : barber!;
  const location = toLocation(
    isOwner ? salon!.location : (barber!.location ?? salon?.location),
  );

  return {
    id: isOwner ? `SAL-${salon!.id}` : `PRO-${account.id}`,
    userId: String(account.id),
    role,
    /* An employee has no trading name of their own — they work in a room
       somebody else named. Falling through to the salon's put its name above
       their photograph and told a stylist she was called Glow Beauty Parlour.
       `display_name` is the server's own answer: the trade name if there is
       one, the person otherwise. */
    businessName: isOwner
      ? salon!.name
      : barber!.display_name || barber!.business_name || account.name,
    title: barber?.title || employment?.title || '',
    tagline: isOwner ? salon!.tagline : '',
    bio: isOwner ? salon!.bio : barber!.bio,
    type: isOwner ? salon!.business_type : 'barber',
    audience: isOwner ? salon!.audience : barber!.audience,
    location,
    phone: isOwner
      ? salon!.business_phone || account.phone
      : barber!.contact_phone || account.phone,
    email: (isOwner ? salon!.contact_email : barber!.contact_email) || account.email,
    avatar: source.avatar,
    coverImage: source.cover_image,
    gallery: toGallery(isOwner ? salon!.gallery : barber!.gallery),
    categoryId: barber?.category_id ?? null,
    categoryName: barber?.category_name ?? null,
    experienceYears: barber?.experience_years ?? 0,
    experienceRange: barber?.experience_range ?? 'under_1',
    specialties: barber?.specialties ?? [],
    socials: {
      instagram: barber?.instagram ?? '',
      facebook: barber?.facebook ?? '',
      tiktok: barber?.tiktok ?? '',
    },
    acceptingClients: barber?.accepting_clients ?? true,
    verification: salon?.verification ?? 'unverified',
    amenities: salon?.amenities ?? [],
    womenOnly: salon?.women_only ?? false,
    privateBooth: salon?.private_booth ?? false,
    // A barber working alone keeps this on their own record; only reading
    // the salon's meant an independent barber who had turned hand-approval
    // on was still shown a switch that said otherwise.
    autoAccept: (isOwner ? salon?.auto_accept : barber?.auto_accept) ?? true,
    salonId: salon?.id,
    salonName: salon?.name,
    // The chair this account sits in. `ownedBy` narrows a queue with it, so
    // without it an employee's screen filtered nothing and leaned entirely
    // on the server having scoped the list already.
    staffId: employment?.id ? String(employment.id) : undefined,
    employmentId: employment?.id,
    commissionRate: employment?.commission_rate,
    joinedAt: account.date_joined,
  };
}

/* --- Calls ---------------------------------------------------------------- */

/** What a PATCH may carry. Which keys the server accepts depends on the
    caller's role, and the server is the one that decides — sending a field a
    role does not own is ignored there, never honoured here. */
export interface ProfilePatch {
  name?: string;
  email?: string;
  location?: Partial<{ area: string; city: string; address: string; latitude: number | null; longitude: number | null }>;
  /* customer */
  gender?: Gender | '';
  hair_type?: HairType | '';
  hair_length?: HairLength | '';
  /* barber and employee */
  avatar?: string;
  cover_image?: string;
  business_name?: string;
  title?: string;
  bio?: string;
  audience?: Audience;
  category_id?: number | null;
  experience_years?: number;
  specialties?: string[];
  contact_phone?: string;
  contact_email?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  accepting_clients?: boolean;
  /* salon owner */
  tagline?: string;
  business_type?: BusinessType;
  business_phone?: string;
  amenities?: string[];
  women_only?: boolean;
  private_booth?: boolean;
  auto_accept?: boolean;
}

export const profileService = {
  get: () => api.get<ApiProfile>('/profile/me/'),
  update: (patch: ProfilePatch) => api.patch<ApiProfile>('/profile/me/', patch),

  listGallery: () => api.get<ApiGalleryImage[]>('/profile/me/gallery/'),
  addGalleryImage: (image: string, caption = '') =>
    api.post<ApiGalleryImage>('/profile/me/gallery/', { image, caption }),
  updateGalleryImage: (id: number, patch: { caption?: string; sort_order?: number }) =>
    api.patch<ApiGalleryImage>(`/profile/me/gallery/${id}/`, patch),
  removeGalleryImage: (id: number) => api.delete<null>(`/profile/me/gallery/${id}/`),
};

export { toGallery, toLocation };
