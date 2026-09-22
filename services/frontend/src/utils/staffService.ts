/* The owner's roster.

   Everything here is refused for anyone but a salon owner, on the server.
   An employee reading their own record uses `/profile/me/` instead — this is
   the salon's view of a chair, not the person's view of themselves. */

import type { StaffRecord } from '../types/provider';
import { api } from './apiClient';

interface ApiEmployeeUser {
  id: number;
  name: string;
  phone: string;
  role: string;
  is_phone_verified: boolean;
}

interface ApiStaff {
  id: number;
  user: ApiEmployeeUser;
  salon: number;
  salon_name: string;
  title: string;
  commission_rate: number;
  is_active: boolean;
  has_own_schedule: boolean;
  service_ids: number[];
  profile: {
    avatar: string;
    bio: string;
    specialties: string[];
    experience_years: number;
    experience_range: string;
    audience: string;
  } | null;
  created_at: string;
}

export const toStaff = (row: ApiStaff): StaffRecord => ({
  id: String(row.id),
  userId: String(row.user.id),
  name: row.user.name,
  phone: row.user.phone,
  title: row.title,
  commissionRate: row.commission_rate,
  active: row.is_active,
  hasOwnSchedule: row.has_own_schedule,
  serviceIds: (row.service_ids ?? []).map(String),
  avatar: row.profile?.avatar ?? '',
  bio: row.profile?.bio ?? '',
  specialties: row.profile?.specialties ?? [],
  experienceYears: row.profile?.experience_years ?? 0,
  phoneVerified: row.user.is_phone_verified,
  joinedAt: row.created_at,
});

/** Adding a chair.

    Two cases behind one call. A number nobody has gets a new account with the
    password the owner sets and hands over; a number that already belongs to a
    barber is attached to the salon, same account, trade record intact. The
    server works out which — the form only has to say whether it knows a name
    and a password to offer. */
export interface NewStaffPayload {
  phone: string;
  name?: string;
  title?: string;
  commission_rate?: number;
  password?: string;
}

/** What an owner may change about a chair.
 *
 *  The job, the split and whether it is open are the salon's. The rest is the
 *  person's own card — theirs to edit too, and the owner's to fill in, since
 *  the owner made the account and it starts empty. */
export interface StaffPatch {
  title?: string;
  commission_rate?: number;
  is_active?: boolean;
  name?: string;
  avatar?: string;
  bio?: string;
  specialties?: string[];
  experience_years?: number;
}

export const staffService = {
  async list(): Promise<StaffRecord[]> {
    return (await api.get<ApiStaff[]>('/salon/employees/')).map(toStaff);
  },

  async get(id: string): Promise<StaffRecord> {
    return toStaff(await api.get<ApiStaff>(`/salon/employees/${id}/`));
  },

  async create(payload: NewStaffPayload): Promise<StaffRecord> {
    return toStaff(await api.post<ApiStaff>('/salon/employees/', payload));
  },

  async update(id: string, patch: StaffPatch): Promise<StaffRecord> {
    return toStaff(await api.patch<ApiStaff>(`/salon/employees/${id}/`, patch));
  },

  /** Ends the employment. A barber who was hired gets their own trade back
      rather than being left as an employee of nowhere. */
  remove: (id: string) => api.delete<null>(`/salon/employees/${id}/`),
};
