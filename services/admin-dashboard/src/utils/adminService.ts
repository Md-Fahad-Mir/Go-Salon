/* The admin dashboard's real API calls. Every function here maps the
   backend's snake_case shape onto the dashboard's existing TypeScript types,
   so the pages that consume them need no shape of their own — the same
   pattern services/frontend's authService.ts/directoryService.ts use. */

import { api } from './apiClient';
import type { AccountStatus, Hairstyle, KpiDatum, SubscriptionTier, TimeRange, User, UserType } from '../types';

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

interface UserApi {
  id: number;
  phone: string;
  name: string;
  email: string;
  role: 'customer' | 'barber' | 'salon_owner' | 'salon_employee' | 'admin';
  subscription_tier: SubscriptionTier;
  account_status: AccountStatus;
  is_phone_verified: boolean;
  date_joined: string;
  total_bookings: number;
  generations_used: number;
  location: { area: string; city: string; address: string; latitude: number | null; longitude: number | null } | null;
  hair_type: string | null;
  hair_length: string | null;
}

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
  subscriptionTier: row.subscription_tier,
  registrationDate: row.date_joined,
  status: row.account_status,
  totalBookings: row.total_bookings,
  averageRating: undefined,
  location: row.location
    ? {
        city: row.location.city,
        area: row.location.area,
        address: row.location.address,
        lat: row.location.latitude ?? 0,
        lng: row.location.longitude ?? 0,
      }
    : undefined,
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

interface OverviewStatsApi {
  active_users: OverviewStatApi;
  new_salons: OverviewStatApi & { awaiting_approval: number };
}

const signed = (pct: number): string => `${pct > 0 ? '+' : ''}${pct}%`;

export const overviewService = {
  async stats(range: TimeRange): Promise<{ activeUsers: KpiDatum; newSalons: KpiDatum }> {
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
      city: input.city,
      address: input.address,
      bio: input.bio ?? '',
    });
    return { ownerName: result.owner.name, salonName: result.salon.name };
  },
};
