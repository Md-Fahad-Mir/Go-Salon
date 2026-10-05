/* The admin dashboard's real API calls. Every function here maps the
   backend's snake_case shape onto the dashboard's existing TypeScript types,
   so the pages that consume them need no shape of their own — the same
   pattern services/frontend's authService.ts/directoryService.ts use. */

import { parseISO } from 'date-fns';
import { api } from './apiClient';
import { formatBdtCompact } from './format';
import type {
  AccountStatus,
  AccountType,
  Audience,
  DailyPoint,
  Hairstyle,
  KpiDatum,
  SubscriptionTier,
  TimeRange,
  User,
  UserBusiness,
  UserType,
} from '../types';

/* --------------------------------------------------------------------------
   Hairstyles — /api/hairstyles/
   -------------------------------------------------------------------------- */

interface HairstyleApi {
  id: number;
  name: string;
  category: string;
  description: string;
  image: string;
  is_active: boolean;
  status: 'active' | 'inactive';
  generation_count: number;
  created_at: string;
  updated_at: string;
}

const toHairstyle = (row: HairstyleApi): Hairstyle => ({
  id: String(row.id),
  name: row.name,
  category: row.category,
  image: row.image,
  description: row.description || undefined,
  generationCount: row.generation_count,
  status: row.status,
  createdAt: row.created_at,
});

export interface HairstyleInput {
  name: string;
  category: string;
  description?: string;
  image?: string;
  active: boolean;
}

const hairstylePayload = (input: Partial<HairstyleInput>) => ({
  ...(input.name !== undefined && { name: input.name }),
  ...(input.category !== undefined && { category: input.category }),
  ...(input.description !== undefined && { description: input.description ?? '' }),
  ...(input.image !== undefined && { image: input.image ?? '' }),
  ...(input.active !== undefined && { is_active: input.active }),
});

export const hairstyleService = {
  async list(query?: string): Promise<Hairstyle[]> {
    const path = query ? `/hairstyles/?q=${encodeURIComponent(query)}` : '/hairstyles/';
    const rows = await api.get<HairstyleApi[]>(path);
    return rows.map(toHairstyle);
  },

  async create(input: HairstyleInput): Promise<Hairstyle> {
    const row = await api.post<HairstyleApi>('/hairstyles/', hairstylePayload(input));
    return toHairstyle(row);
  },

  async update(id: string, input: Partial<HairstyleInput>): Promise<Hairstyle> {
    const row = await api.patch<HairstyleApi>(`/hairstyles/${id}/`, hairstylePayload(input));
    return toHairstyle(row);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/hairstyles/${id}/`);
  },
};

/* --------------------------------------------------------------------------
   Users — /api/admin/users/
   -------------------------------------------------------------------------- */

interface LocationApi {
  area: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface UserBusinessApi {
  id: number;
  name: string;
  business_type: 'salon' | 'barber';
  audience: Audience;
  location: LocationApi;
}

interface UserApi {
  id: number;
  phone: string;
  name: string;
  email: string;
  role: 'customer' | 'barber' | 'salon_owner' | 'salon_employee' | 'admin';
  account_type: AccountType;
  subscription_tier: SubscriptionTier;
  account_status: AccountStatus;
  is_phone_verified: boolean;
  date_joined: string;
  salons: UserBusinessApi[];
  employment: { title: string; salon: UserBusinessApi } | null;
  total_bookings: number;
  generations_used: number;
  location: LocationApi | null;
  hair_type: string | null;
  hair_length: string | null;
}

const toLocation = (row: LocationApi) => ({
  city: row.city,
  area: row.area,
  address: row.address,
  lat: row.latitude ?? 0,
  lng: row.longitude ?? 0,
});

const toUserBusiness = (row: UserBusinessApi): UserBusiness => ({
  id: String(row.id),
  name: row.name,
  businessType: row.business_type,
  audience: row.audience,
  location: toLocation(row.location),
});

const ROLE_TO_USER_TYPE: Record<UserApi['role'], UserType> = {
  customer: 'customer',
  barber: 'barber',
  salon_owner: 'salon',
  salon_employee: 'employee',
  admin: 'admin',
};

const USER_TYPE_TO_ROLE: Record<UserType, UserApi['role']> = {
  customer: 'customer',
  barber: 'barber',
  salon: 'salon_owner',
  employee: 'salon_employee',
  admin: 'admin',
};

const toUser = (row: UserApi): User => ({
  id: String(row.id),
  name: row.name,
  phone: row.phone,
  email: row.email || undefined,
  userType: ROLE_TO_USER_TYPE[row.role],
  accountType: row.account_type,
  salons: row.salons.map(toUserBusiness),
  employment: row.employment
    ? { title: row.employment.title, salon: toUserBusiness(row.employment.salon) }
    : undefined,
  subscriptionTier: row.subscription_tier,
  registrationDate: row.date_joined,
  status: row.account_status,
  totalBookings: row.total_bookings,
  averageRating: undefined,
  location: row.location ? toLocation(row.location) : undefined,
  hairType: row.hair_type ?? undefined,
  preferredLength: row.hair_length ?? undefined,
  phoneVerified: row.is_phone_verified,
  generationsUsed: row.generations_used,
});

export interface UserUpdateInput {
  name?: string;
  phone?: string;
  email?: string;
  userType?: UserType;
  subscriptionTier?: SubscriptionTier;
  status?: AccountStatus;
  phoneVerified?: boolean;
}

const userUpdatePayload = (input: UserUpdateInput) => ({
  ...(input.name !== undefined && { name: input.name }),
  ...(input.phone !== undefined && { phone: input.phone }),
  ...(input.email !== undefined && { email: input.email ?? '' }),
  ...(input.userType !== undefined && { role: USER_TYPE_TO_ROLE[input.userType] }),
  ...(input.subscriptionTier !== undefined && { subscription_tier: input.subscriptionTier }),
  ...(input.status !== undefined && { account_status: input.status }),
  ...(input.phoneVerified !== undefined && { is_phone_verified: input.phoneVerified }),
});

export const userService = {
  async list(query?: string): Promise<User[]> {
    const path = query ? `/admin/users/?q=${encodeURIComponent(query)}` : '/admin/users/';
    const rows = await api.get<UserApi[]>(path);
    return rows.map(toUser);
  },

  async update(id: string, input: UserUpdateInput): Promise<User> {
    const row = await api.patch<UserApi>(`/admin/users/${id}/`, userUpdatePayload(input));
    return toUser(row);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/admin/users/${id}/`);
  },

  /** The same OTP-based reset flow a self-service user would trigger
      themselves — reused as-is rather than minted as an admin-only endpoint. */
  async sendPasswordReset(phone: string): Promise<void> {
    await api.post('/auth/password/forgot/', { phone }, { anonymous: true });
  },
};

/* --------------------------------------------------------------------------
   Overview stats — /api/admin/overview/
   -------------------------------------------------------------------------- */

interface OverviewStatApi {
  value: number;
  change_pct: number;
  tone: 'positive' | 'negative' | 'neutral';
}

/** Every completed 360° try-on video, priced both ways (Apps/tryon/stats.py). */
interface AISpendApi {
  videos: number;
  spend_usd: number | null;
  /** Null when the AI service's price list could not be read. */
  spend_bdt: number | null;
  revenue_bdt: number;
  margin_pct: number | null;
  /** Videos whose model has no list price, left out of the spend. */
  unpriced_videos: number;
  video_price_bdt: number;
  usd_to_bdt: number;
  error: { code: string; message: string } | null;
}

interface OverviewStatsApi {
  active_users: OverviewStatApi;
  new_salons: OverviewStatApi & { awaiting_approval: number };
  tryon_videos: OverviewStatApi;
  /** Completed videos per business day (Asia/Dhaka), oldest first, ending today. */
  tryon_videos_daily: Array<{ date: string; count: number }>;
  ai_spend: AISpendApi;
}

const signed = (pct: number): string => `${pct > 0 ? '+' : ''}${pct}%`;

const taka = (value: number): string => formatBdtCompact(Math.round(value));

/** Friday and Saturday — the Bangladeshi weekend, when salons are busiest. */
const isWeekend = (isoDate: string): boolean => [5, 6].includes(parseISO(isoDate).getDay());

const toAISpend = (data: AISpendApi): KpiDatum => {
  const notes = [
    data.margin_pct === null ? null : `margin ${data.margin_pct}%`,
    data.error ? `spend unavailable: ${data.error.message}` : null,
    data.unpriced_videos ? `${data.unpriced_videos} video(s) with no list price` : null,
  ].filter(Boolean);
  return {
    id: 'spend',
    label: 'AI spend vs revenue',
    value: `${data.spend_bdt === null ? '—' : taka(data.spend_bdt)} / ${taka(data.revenue_bdt)}`,
    footnote: notes.join(' · ') || 'no videos yet',
    tone: data.margin_pct === null ? 'neutral' : data.margin_pct >= 0 ? 'positive' : 'negative',
  };
};

export const overviewService = {
  async stats(
    range: TimeRange,
  ): Promise<{
    activeUsers: KpiDatum;
    newSalons: KpiDatum;
    tryOnVideos: KpiDatum;
    aiSpend: KpiDatum;
    videosPerDay: DailyPoint[];
  }> {
    const data = await api.get<OverviewStatsApi>(`/admin/overview/?range=${range}`);
    return {
      activeUsers: {
        id: 'active-users',
        label: 'Active users',
        value: data.active_users.value.toLocaleString(),
        footnote: `${signed(data.active_users.change_pct)} vs previous period`,
        tone: data.active_users.tone,
      },
      newSalons: {
        id: 'new-salons',
        label: 'New salons Created',
        value: data.new_salons.value.toLocaleString(),
        footnote: `${signed(data.new_salons.change_pct)} · ${data.new_salons.awaiting_approval} awaiting approval`,
        tone: data.new_salons.tone,
      },
      tryOnVideos: {
        id: 'tryon-videos',
        label: '360° try-on video',
        value: data.tryon_videos.value.toLocaleString(),
        footnote: `${signed(data.tryon_videos.change_pct)} vs previous period`,
        tone: data.tryon_videos.tone,
      },
      aiSpend: toAISpend(data.ai_spend),
      videosPerDay: data.tryon_videos_daily.map((day) => ({
        date: day.date,
        generations: day.count,
        highlight: isWeekend(day.date),
      })),
    };
  },
};

/* --------------------------------------------------------------------------
   Create salon — /api/admin/salons/
   -------------------------------------------------------------------------- */

export interface CreateSalonInput {
  name: string;
  businessType: 'salon' | 'barber';
  ownerName: string;
  phone: string;
  email?: string;
  /** The owner's initial password; without one the backend sets a random one. */
  password?: string;
  city: string;
  address: string;
  bio?: string;
}

export const salonService = {
  async create(input: CreateSalonInput): Promise<{ ownerName: string; salonName: string }> {
    const result = await api.post<{ owner: { name: string }; salon: { name: string } }>('/admin/salons/', {
      business_name: input.name,
      business_type: input.businessType,
      owner_name: input.ownerName,
      owner_phone: input.phone,
      owner_email: input.email ?? '',
      ...(input.password && { owner_password: input.password }),
      city: input.city,
      address: input.address,
      bio: input.bio ?? '',
    });
    return { ownerName: result.owner.name, salonName: result.salon.name };
  },
};

/* --------------------------------------------------------------------------
   AI generation — /api/admin/settings/ai-generation/
   Which OpenRouter video model renders every 360° try-on, and what a
   customer pays for one. The model list is OpenRouter's own catalogue,
   narrowed by the AI service to the models that can start from a photo and
   render 2–3 seconds.
   -------------------------------------------------------------------------- */

interface VideoModelApi {
  id: string;
  name: string;
  description: string;
  duration_seconds: number;
  resolution: string | null;
  price_per_video_usd: number | null;
}

interface AIGenerationApi {
  video_model: string;
  selected: string;
  default_model: string;
  models: VideoModelApi[];
  video_model_available: boolean | null;
  models_error: { code: string; message: string } | null;
  video_price_bdt: number;
  updated_at: string;
}

export interface VideoModelOption {
  id: string;
  name: string;
  description: string;
  durationSeconds: number;
  resolution: string | null;
  /** OpenRouter's list price for one clip as requested; null when it cannot
      be known in advance. */
  pricePerVideoUsd: number | null;
}

export interface AIGenerationSettings {
  /** The model in use: the admin's pick, or the AI service's default. */
  videoModel: string;
  defaultModel: string;
  models: VideoModelOption[];
  /** False when the model in use can no longer render a 360° try-on. */
  videoModelAvailable: boolean | null;
  /** Why the list could not be loaded, when it could not. */
  modelsError: string | null;
  /** What a customer pays for one 360° try-on video, in taka. */
  videoPriceBdt: number;
}

const toAIGeneration = (row: AIGenerationApi): AIGenerationSettings => ({
  videoModel: row.video_model,
  defaultModel: row.default_model,
  models: row.models.map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    durationSeconds: model.duration_seconds,
    resolution: model.resolution,
    pricePerVideoUsd: model.price_per_video_usd,
  })),
  videoModelAvailable: row.video_model_available,
  modelsError: row.models_error?.message ?? null,
  videoPriceBdt: row.video_price_bdt,
});

export const aiGenerationService = {
  async get(): Promise<AIGenerationSettings> {
    return toAIGeneration(await api.get<AIGenerationApi>('/admin/settings/ai-generation/'));
  },

  async setVideoModel(videoModel: string): Promise<AIGenerationSettings> {
    return toAIGeneration(
      await api.patch<AIGenerationApi>('/admin/settings/ai-generation/', { video_model: videoModel }),
    );
  },

  async setVideoPrice(priceBdt: number): Promise<AIGenerationSettings> {
    return toAIGeneration(
      await api.patch<AIGenerationApi>('/admin/settings/ai-generation/', { video_price_bdt: priceBdt }),
    );
  },
};
