import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useProviderStore } from '../store/useProviderStore';
import { authService } from '../utils/authService';

/** Works out whether the stored session is still good, once, on start-up.

    A token in storage is not proof of anything — it may have expired, been
    blacklisted by a logout somewhere else, or belong to an account that has
    since changed role. So the app asks the backend who it is before deciding
    what to render, and the guards hold their answer until it comes back. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const setUser = useAppStore((state) => state.setUser);
  const setAuthStatus = useAppStore((state) => state.setAuthStatus);
  const clearSession = useAppStore((state) => state.clearSession);

  useEffect(() => {
    const token = useAppStore.getState().accessToken;
    if (!token) {
      setAuthStatus('ready');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const user = await authService.me();
        if (cancelled) return;
        setUser(user);
        if (user.role && user.role !== 'customer' && user.role !== 'admin') {
          void useProviderStore.getState().load();
        }
      } catch {
        // The api client already tried a refresh. Reaching here means there is
        // no session left, so the app starts signed out.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setAuthStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setUser, setAuthStatus, clearSession]);

  return <>{children}</>;
}
