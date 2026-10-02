import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface AdminUser {
  id: number;
  phone: string;
  name: string;
  email: string;
  role: string;
}

export type AuthStatus = 'restoring' | 'ready';

interface AuthStore {
  user: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** 'restoring' until the start-up check against /auth/me/ resolves, so the
      route guard can hold its answer instead of flashing the login page. */
  status: AuthStatus;

  setSession: (user: AdminUser, access: string, refresh: string) => void;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AdminUser) => void;
  setStatus: (status: AuthStatus) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      status: 'restoring',

      setSession: (user, access, refresh) =>
        set({ user, accessToken: access, refreshToken: refresh, status: 'ready' }),

      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),

      setUser: (user) => set({ user }),

      setStatus: (status) => set({ status }),

      clearSession: () => set({ user: null, accessToken: null, refreshToken: null, status: 'ready' }),
    }),
    {
      name: 'admin-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);

export const selectIsAuthenticated = (state: AuthStore): boolean =>
  Boolean(state.accessToken && state.user);
