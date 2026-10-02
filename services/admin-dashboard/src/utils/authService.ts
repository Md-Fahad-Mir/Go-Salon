import { api } from './apiClient';
import type { AdminUser } from '../store/useAuthStore';

interface SessionResponse {
  access: string;
  refresh: string;
  user: AdminUser;
}

export const authService = {
  /** Phone + password, restricted server-side to staff/superuser accounts
      (POST /api/auth/admin/login/ — Apps/users/views.py AdminLoginView). */
  login(phone: string, password: string): Promise<SessionResponse> {
    return api.post<SessionResponse>('/auth/admin/login/', { phone, password }, { anonymous: true });
  },

  logout(refresh: string): Promise<null> {
    return api.post<null>('/auth/logout/', { refresh });
  },

  me(): Promise<AdminUser> {
    return api.get<AdminUser>('/auth/me/');
  },
};
