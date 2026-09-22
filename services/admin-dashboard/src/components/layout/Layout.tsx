import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useStore } from '../../store/useStore';
import { Toaster } from '../ui/Toaster';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [drawerRequested, setDrawerRequested] = useState(false);
  const collapsed = useStore((state) => state.sidebarCollapsed);
  const isDesktop = useIsDesktop();

  // The drawer only exists below the desktop breakpoint; deriving it rather
  // than storing it means a resize can never leave a stale overlay behind.
  const drawerOpen = drawerRequested && !isDesktop;

  return (
    <div className="app" data-collapsed={collapsed}>
      <a href="#main" className="sr-only">
        Skip to main content
      </a>

      <Sidebar open={drawerOpen} onClose={() => setDrawerRequested(false)} />
      {drawerOpen ? (
        <button
          type="button"
          className="scrim"
          aria-label="Close menu"
          onClick={() => setDrawerRequested(false)}
        />
      ) : null}

      <div className="app-main">
        <Header
          onMenuClick={() => setDrawerRequested((value) => !value)}
          sidebarOpen={drawerOpen}
        />
        <main className="page" id="main">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  );
}
