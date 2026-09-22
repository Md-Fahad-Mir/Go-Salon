import { Bell, ChevronRight, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { areaLabel } from '../components/auth/areas';
import { Avatar } from '../components/common/Avatar';
import { HairstyleCard } from '../components/common/HairstyleCard';
import { IconButton } from '../components/common/IconButton';
import { ProfessionalCard } from '../components/common/ProfessionalCard';
import { SectionHead } from '../components/common/SectionHead';
import { CardSkeleton } from '../components/common/Skeleton';
import { HeroCard } from '../components/home/HeroCard';
import { NextVisitCard } from '../components/home/NextVisitCard';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { DEFAULT_LOCATION, ROUTES } from '../constants';
import { useNearby } from '../hooks/useNearby';
import { useT } from '../hooks/useLanguage';
import type { TKey } from '../i18n';
import { mockHairstyles } from '../mockData';
import { useAppStore } from '../store/useAppStore';
import { combineDateTime, firstNameOf, formatNumber, toDateKey } from '../utils/format';
import { audienceFor } from '../utils/audience';
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

  const point = user?.location ?? DEFAULT_LOCATION;
  const area = user?.location?.area ?? DEFAULT_LOCATION.area;
  const audience = audienceFor(user?.gender) ?? undefined;
  const { list: nearby, loading } = useNearby(point, 4, audience);
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
          <SectionHead
            title={t('home.trending')}
            action={{ label: t('action.seeAll'), to: `${ROUTES.search}?tab=styles` }}
          />
          <div className="hscroll bleed stagger home-trending" role="list" aria-label={t('home.trending')}>
            {trending.map((style) => (
              <div key={style.id} role="listitem">
                <HairstyleCard style={style} size="sm" />
              </div>
            ))}
          </div>
        </section>

        <section className="section home-section">
          <div className="section-head home-nearby-head">
            <div className="stack-xs">
              <h2>{t('home.nearbyPros')}</h2>
              <p className="caption">{t('home.nearArea', { area: areaLabel(t, area) })}</p>
              {/* Say out loud that the list is narrowed, and offer the way
                  out — a silent filter reads as missing salons. */}
              {audience ? (
                <p className="home-tailored">
                  <Sparkles size={13} aria-hidden="true" />
                  {t('home.genderFilterNotice')}
                  <Link to={`${ROUTES.search}?audience=all`}>{t('home.genderFilterChange')}</Link>
                </p>
              ) : null}
            </div>
            <Link to={ROUTES.search}>
              {t('action.seeAll')} <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {loading ? (
            <CardSkeleton count={2} />
          ) : (
            <div className="stack stagger" aria-live="polite">
              {nearby.map((pro) => (
                <ProfessionalCard key={pro.id} pro={pro} variant="list" />
              ))}
            </div>
          )}
        </section>
      </ScreenBody>
    </Screen>
  );
}
