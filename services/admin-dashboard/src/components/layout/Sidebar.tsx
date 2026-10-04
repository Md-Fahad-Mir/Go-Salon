import { NavLink } from 'react-router-dom';
import { Bell, LayoutGrid, Scissors, Settings, Store, Users, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES } from '../../constants';
import { GoSalonMark } from '../ui/GoSalonMark';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.overview, label: 'Overview', icon: LayoutGrid, end: true },
  { to: ROUTES.hairstyles, label: 'AI Hairstyles', icon: Scissors },
  { to: ROUTES.users, label: 'Users', icon: Users },
  { to: ROUTES.salons, label: 'Salons & Parlour', icon: Store },
  { to: ROUTES.payments, label: 'Payments', icon: Wallet },
  { to: ROUTES.notifications, label: 'Notifications', icon: Bell },
  { to: ROUTES.settings, label: 'Settings', icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <nav className="sidebar" data-open={open} aria-label="Main">
      <div className="sidebar-brand">
        <span className="sidebar-mark" aria-hidden="true">
          <GoSalonMark />
        </span>
        <span className="sidebar-wordmark">
          Go Salon <span>ADMIN</span>
        </span>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
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
            </NavLink>
          );
        })}
      </div>

      <p className="sidebar-foot">v0.9 · dhaka-prod</p>
    </nav>
  );
}
