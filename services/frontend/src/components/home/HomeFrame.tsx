import { Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { formatNumber } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { IconButton } from '../common/IconButton';
import { Header } from '../layout/Header';
import { Screen, ScreenBody } from '../layout/Screen';

/** Home's own chrome, for every moment Home has no salon profile to show:
    no salon yet, several and none chosen, the list still arriving, or the
    active salon's listing still loading or failed to load.

    The word-mark, the bell and the way to Profile — and never a back arrow.
    Home is where Back goes, so a Home that offered one would be offering a
    way out of the app. `SalonProfile` uses this too when it is rendered as
    Home, which is what keeps its waiting and failing states from borrowing
    the route form's "Salon" header and its back arrow. */
export function HomeFrame({ children, center = false }: { children: ReactNode; center?: boolean }) {
  const navigate = useNavigate();
  const t = useT();
  const user = useAppStore((s) => s.user);
  // A number, so a store write that leaves the count alone re-renders nothing.
  const unread = useAppStore((s) => s.notifications.filter((n) => !n.read).length);

  return (
    <Screen nav>
      <Header
        brand
        actions={
          <>
            <IconButton
              label={
                unread
                  ? t('home.notificationsUnread', { count: formatNumber(unread) })
                  : t('home.notifications')
              }
              dot={unread > 0}
              onClick={() => navigate(ROUTES.notifications)}
            >
              <Bell size={22} />
            </IconButton>
            <Link to={ROUTES.profile} className="home-avatar-link" aria-label={t('home.yourProfile')}>
              <Avatar name={user?.name ?? t('home.you')} src={user?.avatar} size="sm" accent={!user?.avatar} />
            </Link>
          </>
        }
      />
      <ScreenBody className={center ? 'fullscreen-center' : undefined}>{children}</ScreenBody>
    </Screen>
  );
}
