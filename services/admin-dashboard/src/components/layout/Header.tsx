import { useEffect, useMemo, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { formatDateTime } from '../../utils/format';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useStore } from '../../store/useStore';
import { AccountMenu } from './AccountMenu';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
}

export function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const isDesktop = useIsDesktop();
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const toggleCollapsed = useStore((state) => state.toggleSidebarCollapsed);

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

      <div className="header-right">
        <time className="header-date" dateTime={now.toISOString()}>
          {clock}
        </time>
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
