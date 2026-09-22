import { NavLink } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  LayoutGrid,
  Scissors,
  ScrollText,
  Settings,
  ShieldAlert,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES } from '../../constants';
import { selectOpenFlagCount, useStore } from '../../store/useStore';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'moderation';
}

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.overview, label: 'Overview', icon: LayoutGrid, end: true },
  { to: ROUTES.hairstyles, label: 'Hairstyles', icon: Scissors },
  { to: ROUTES.users, label: 'Users', icon: Users },
  { to: ROUTES.salons, label: 'Salons & barbers', icon: Store },
  { to: ROUTES.moderation, label: 'Moderation', icon: ShieldAlert, badge: 'moderation' },
  { to: ROUTES.payments, label: 'Payments', icon: Wallet },
  { to: ROUTES.bookings, label: 'Bookings', icon: CalendarDays },
  { to: ROUTES.notifications, label: 'Notifications', icon: Bell },
  { to: ROUTES.settings, label: 'Settings', icon: Settings },
  { to: ROUTES.auditLog, label: 'Audit log', icon: ScrollText },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const flagCount = useStore(selectOpenFlagCount);

  return (
    <nav className="sidebar" data-open={open} aria-label="Main">
      <div className="sidebar-brand">
        <span className="sidebar-mark" aria-hidden="true">
          E
        </span>
        <span className="sidebar-wordmark">
          Eureka <span>ADMIN</span>
        </span>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const showBadge = item.badge === 'moderation' && flagCount > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="sb-item"
              onClick={onClose}
              title={item.label}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span className="sb-label">{item.label}</span>
              {showBadge ? (
                <span className="sb-badge" aria-label={`${flagCount} items awaiting moderation`}>
                  {flagCount}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>

      <p className="sidebar-foot">v0.9 · dhaka-prod</p>
    </nav>
  );
}
