import { NavLink, useLocation } from 'react-router-dom';
import { useT } from '../../hooks/useLanguage';
import { useRole } from '../../hooks/useRole';
import { NAV_TABS, navTabsFor } from './navTabs';

export function BottomNavigation() {
  const { pathname } = useLocation();
  const { role } = useRole();
  const t = useT();
  const tabs = navTabsFor(role) ?? NAV_TABS.customer;

  if (!tabs.length) return null;

  return (
    <nav className="bottom-nav" aria-label={t('nav.sections')} data-count={tabs.length}>
      {tabs.map((tab) => {
        const active = tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="nav-item"
            aria-current={active ? 'page' : undefined}
            data-hero={tab.hero ? 'true' : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
            <span>{t(tab.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
