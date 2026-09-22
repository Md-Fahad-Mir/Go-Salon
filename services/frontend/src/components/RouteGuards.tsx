import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HOME_ROUTE_FOR, ROUTES, isProviderRole } from '../constants';
import { useAppStore } from '../store/useAppStore';
import { Spinner } from './common/Spinner';

/* Route guards keep people out of screens that are not theirs. They are not
   the security boundary — the backend's permissions are. A guard that lets
   someone through still gets a 403 from the API. */

/** Held while the app is asking the backend whether its stored token is still
    good. Rendering sign-in first would sign people out on every reload. */
function Restoring() {
  return (
    <div className="fullscreen-center" aria-busy="true" style={{ minHeight: '100dvh' }}>
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

const useSession = () => ({
  status: useAppStore((s) => s.authStatus),
  isAuthenticated: useAppStore((s) => s.isAuthenticated),
  role: useAppStore((s) => s.user?.role) ?? 'customer',
  audience: useAppStore((s) => s.user?.audience),
});

/** Wraps every signed-in screen. */
export function RequireAuth() {
  const { status, isAuthenticated } = useSession();
  const location = useLocation();
  if (status === 'restoring') return <Restoring />;
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Auth screens bounce a signed-in user to whichever app is theirs. */
export function PublicOnly() {
  const { status, isAuthenticated, role } = useSession();
  if (status === 'restoring') return <Restoring />;
  if (isAuthenticated) return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
  return <Outlet />;
}

/** The code screen only makes sense for a sign-up waiting on one. */
export function RequirePendingVerification() {
  const pending = useAppStore((s) => s.pendingVerification);
  if (!pending) return <Navigate to={ROUTES.login} replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const { status, isAuthenticated, role } = useSession();
  if (status === 'restoring') return <Restoring />;
  if (!isAuthenticated) return <Navigate to={ROUTES.welcome} replace />;
  return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
}

/** The customer app. Anyone else is sent to their own. */
export function CustomerOnly() {
  const { role } = useSession();
  if (role !== 'customer') return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
  return <Outlet />;
}

/** Any provider screen. Customers and admins are sent back to theirs. */
export function ProviderOnly() {
  const { role } = useSession();
  if (!isProviderRole(role)) return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
  return <Outlet />;
}

/** A screen only some providers have — the owner's roster, an employee's
    shift. Anyone else is sent to their own landing screen. */
export function RoleOnly({ allow }: { allow: readonly string[] }) {
  const { role } = useSession();
  if (!allow.includes(role)) return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
  return <Outlet />;
}

/** Clients, treatments and the lookbook: the screens a barber whose clients
    are women works from. A variation of the barber's app, chosen by the
    account's audience rather than by a role of its own. */
export function WomensStylistOnly() {
  const { role, audience } = useSession();
  if (role !== 'barber' || audience !== 'women') {
    return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
  }
  return <Outlet />;
}

export function AdminOnly() {
  const { role } = useSession();
  if (role !== 'admin') return <Navigate to={HOME_ROUTE_FOR[role] ?? ROUTES.home} replace />;
  return <Outlet />;
}
