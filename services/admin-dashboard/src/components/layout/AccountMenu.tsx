import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { ROUTES } from '../../constants';
import { useClickOutside, useEscapeKey } from '../../hooks/useUi';
import { useAuthStore } from '../../store/useAuthStore';
import { authService } from '../../utils/authService';
import { titleCase } from '../../utils/format';
import { Avatar } from '../ui/Avatar';

/** The signed-in account, top-right. Click it for who you are and the one
    thing you can do about it. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(open, close);
  useEscapeKey(open, close);

  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  if (!user) return null;

  const handleLogout = async () => {
    close();
    if (refreshToken) {
      try {
        await authService.logout(refreshToken);
      } catch {
        // The token may already be expired or blacklisted — either way the
        // local session still needs to go.
      }
    }
    clearSession();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <div className="menu-wrap account-menu" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={user.name} accent />
        <span className="account-trigger-text">
          <strong>{user.name}</strong>
          <span className="dim">{titleCase(user.role)}</span>
        </span>
        <ChevronDown size={14} className="account-chevron" aria-hidden="true" />
      </button>
      <span className="sr-only">Signed in as {user.name}</span>

      {open ? (
        <div className="menu account-dropdown" role="menu">
          <div className="account-summary">
            <Avatar name={user.name} size="lg" accent />
            <div>
              <strong>{user.name}</strong>
              <span className="dim">{user.phone}</span>
            </div>
          </div>
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
