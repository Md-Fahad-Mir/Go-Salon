/* The price list: services and the headings they sit under.

   The same two endpoints serve a barber and a salon. What differs is only
   what the server scopes them to, which is decided from the caller's role —
   so there is one client here, not one per kind of professional. */

import type { ProviderService, ServiceAudience, ServiceCategory } from '../types/provider';
import { api } from './apiClient';

interface ApiCategory {
  id: number;
  name: string;
  icon: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  is_shared: boolean;
}

interface ApiService {
  id: number;
  name: string;
  description: string;
  /** DRF sends a decimal as a string so no precision is lost on the way. */
  price: string;
  duration_minutes: number;
  buffer_minutes: number;
  audience: ServiceAudience;
  includes: string[];
  steps: string[];
  category_id: number | null;
  category_name: string | null;
  eligible_employee_ids: number[];
  available_to_all_staff: boolean;
  is_active: boolean;
  is_popular: boolean;
}

export const toCategory = (row: ApiCategory): ServiceCategory => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  description: row.description,
  shared: row.is_shared,
});

export const toService = (row: ApiService): ProviderService => ({
  id: String(row.id),
  name: row.name,
  categoryId: row.category_id,
  category: row.category_name ?? '',
  price: Number(row.price),
  duration: row.duration_minutes,
  bufferBefore: row.buffer_minutes,
  description: row.description,
  includes: row.includes ?? [],
  steps: row.steps ?? [],
  audience: row.audience,
  staffIds: (row.eligible_employee_ids ?? []).map(String),
  availableToAll: row.available_to_all_staff,
  active: row.is_active,
  popular: row.is_popular,
});

/** What a service looks like on its way in. Everything optional on a PATCH;
    `name`, `price` and `duration_minutes` are required to create one. */
export interface ServicePayload {
  name?: string;
  description?: string;
  price?: number;
  duration_minutes?: number;
  buffer_minutes?: number;
  audience?: ServiceAudience;
  includes?: string[];
  steps?: string[];
  category_id?: number | null;
  /** Omit to leave eligibility alone; send `[]` to open it to all staff. */
  eligible_employee_ids?: number[];
  is_active?: boolean;
  is_popular?: boolean;
}

export const catalogService = {
  async listCategories(): Promise<ServiceCategory[]> {
    return (await api.get<ApiCategory[]>('/services/categories/')).map(toCategory);
  },

  async createCategory(name: string, icon = '', description = ''): Promise<ServiceCategory> {
    return toCategory(
      await api.post<ApiCategory>('/services/categories/', { name, icon, description }),
    );
  },

  async listServices(): Promise<ProviderService[]> {
    return (await api.get<ApiService[]>('/services/')).map(toService);
  },

  async createService(payload: ServicePayload): Promise<ProviderService> {
    return toService(await api.post<ApiService>('/services/', payload));
  },

  async updateService(id: string, payload: ServicePayload): Promise<ProviderService> {
    return toService(await api.patch<ApiService>(`/services/${id}/`, payload));
  },

  removeService: (id: string) => api.delete<null>(`/services/${id}/`),
};
