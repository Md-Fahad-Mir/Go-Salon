import { Bell } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/common/Avatar';
import { HairstyleCard } from '../components/common/HairstyleCard';
import { IconButton } from '../components/common/IconButton';
import { SectionHead } from '../components/common/SectionHead';
import { HeroCard } from '../components/home/HeroCard';
import { NextVisitCard } from '../components/home/NextVisitCard';
import { YourSalons } from '../components/home/YourSalons';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { ROUTES } from '../constants';
import { useT } from '../hooks/useLanguage';
import type { TKey } from '../i18n';
import { mockHairstyles } from '../mockData';
import { useAppStore } from '../store/useAppStore';
import { combineDateTime, firstNameOf, formatNumber, toDateKey } from '../utils/format';
import { trendingHairstyles } from '../utils/recommend';


/** `greetingFor` in utils/format answers in English, so the home screen picks
    the shared greeting key off the same clock instead. */
const greetingKey = (hour: number): TKey =>
  hour < 12 ? 'greeting.morning' : hour < 17 ? 'greeting.afternoon' : 'greeting.evening';

export default function HomePage() {
  const navigate = useNavigate();
  const t = useT();
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings);
  const notifications = useAppStore((s) => s.notifications);
  const unread = notifications.filter((n) => !n.read).length;
  /** Captured once per mount so render stays pure. */
  const [today] = useState(() => toDateKey(new Date()));
  const [hour] = useState(() => new Date().getHours());

  const trending = useMemo(
    () => trendingHairstyles(mockHairstyles, 8, user?.gender),
    [user?.gender],
  );

  const nextVisit = useMemo(
    () =>
      bookings
        .filter((b) => (b.status === 'pending' || b.status === 'approved') && b.date >= today)
        .sort((a, b) => combineDateTime(a.date, a.time).getTime() - combineDateTime(b.date, b.time).getTime())[0],
    [bookings, today],
  );

  const name = user ? firstNameOf(user.name) : t('home.strangerName');

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
      <ScreenBody>
        <div className="home-greeting">
          <h2>{t('home.greetingLine', { greeting: t(greetingKey(hour)), name })}</h2>
          <p className="caption">{t('home.readyForNewLook')}</p>
        </div>

        <HeroCard credits={user?.credits ?? 0} />

        {nextVisit ? (
          <section className="section home-section">
            <SectionHead title={t('home.nextVisit')} action={{ label: t('home.allBookings'), to: ROUTES.bookings }} />
            <NextVisitCard booking={nextVisit} />
          </section>
        ) : null}

        <section className="section home-section">
          {/* No "see all": the screen it led to was the cross-salon search,
              which is withdrawn. The cards still go to the try-on flow, which
              is not a salon-discovery feature and is untouched. */}
          <SectionHead title={t('home.trending')} />
          <div className="hscroll bleed stagger home-trending" role="list" aria-label={t('home.trending')}>
            {trending.map((style) => (
              <div key={style.id} role="listitem">
                <HairstyleCard style={style} size="sm" />
              </div>
            ))}
          </div>
        </section>

        <YourSalons />

      </ScreenBody>
    </Screen>
  );
}
