import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ADMIN_USER, ROUTES } from '../../constants';
import { formatDateTime } from '../../utils/format';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useStore } from '../../store/useStore';
import { Avatar } from '../ui/Avatar';
import { SearchBar } from '../ui/SearchBar';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
}

/** Global search routes to the page that owns the match — a phone number goes
    to Users, a BKG id to Bookings, and so on. */
const routeForQuery = (query: string): string => {
  const value = query.trim().toUpperCase();
  if (value.startsWith('BKG')) return ROUTES.bookings;
  if (value.startsWith('TRX')) return ROUTES.payments;
  if (value.startsWith('BIZ')) return ROUTES.salons;
  if (value.startsWith('HS')) return ROUTES.hairstyles;
  if (value.startsWith('MOD')) return ROUTES.moderation;
  if (value.startsWith('NTF')) return ROUTES.notifications;
  if (value.startsWith('LOG')) return ROUTES.auditLog;
  return ROUTES.users;
};

export function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const toggleCollapsed = useStore((state) => state.toggleSidebarCollapsed);
  const pushToast = useStore((state) => state.pushToast);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const clock = useMemo(() => formatDateTime(now), [now]);

  return (
    <header className="header" data-scrolled={scrolled}>
      <button
        type="button"
        className="icon-btn menu-btn"
        onClick={onMenuClick}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={sidebarOpen}
      >
        <Menu size={20} />
      </button>

      {isDesktop ? (
        <button
          type="button"
          className="icon-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      ) : null}

      <form
        className="header-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim()) return;
          navigate(routeForQuery(query));
          pushToast('info', 'Search applied', `Looking for “${query.trim()}”`);
          setQuery('');
        }}
      >
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search users, salons, transactions…"
          label="Search the console"
        />
      </form>

      <div className="header-right">
        <time className="header-date" dateTime={now.toISOString()}>
          {clock}
        </time>
        <ThemeToggle />
        <span title={`${ADMIN_USER.name} · ${ADMIN_USER.role}`}>
          <Avatar name={ADMIN_USER.name} />
        </span>
        <span className="sr-only">Signed in as {ADMIN_USER.name}</span>
      </div>
    </header>
  );
}
