import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, selectIsAuthenticated } from '../store/useAuthStore';
import { authService } from '../utils/authService';
import { Skeleton } from './ui/Skeleton';
import { ROUTES } from '../constants';

/** Resolves whether the stored session is still good, once, on start-up.

    A token in storage is not proof of anything — it may have expired or been
    blacklisted elsewhere — so the app asks the backend who it is before
    deciding what to render. Also the gate around every /admin route: no
    session, no page. */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const setUser = useAuthStore((state) => state.setUser);
  const setStatus = useAuthStore((state) => state.setStatus);
  const clearSession = useAuthStore((state) => state.clearSession);
  const location = useLocation();

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      setStatus('ready');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const user = await authService.me();
        if (!cancelled) setUser(user);
      } catch {
        // The api client already tried a refresh. Reaching here means there
        // is no session left.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'restoring') {
    return (
      <div className="stack" style={{ padding: '2rem' }} aria-busy="true" aria-label="Loading">
        <Skeleton width="14rem" height="2rem" />
        <Skeleton height="6rem" radius="0.75rem" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
