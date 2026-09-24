import { CalendarDays, LifeBuoy, Mail, MapPin, MessageSquare, Pencil, Phone, Scissors, Settings, Sparkles, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { LinkButton } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { LogoutButton } from '../../components/profile/LogoutButton';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { HAIR_LENGTH_KEYS, HAIR_TYPE_KEYS } from '../../components/profile/hairLabels';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { formatNumber, formatPhone } from '../../utils/format';

export default function ProfilePage() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings);
  const t = useT();
  /* Counted off the bookings already loaded rather than fetched again: a
     customer's reviews are exactly the reviews on their own visits, and the
     server sends each one with the booking it belongs to. */
  const reviewCount = bookings.filter((booking) => booking.review).length;

  if (!user) {
    return (
      <Screen nav>
        <Header title={t('nav.profile')} />
        <ScreenBody className="fullscreen-center">
          <EmptyState
            icon={<UserRound size={26} aria-hidden="true" />}
            title={t('profile.signedOutTitle')}
            description={t('profile.signedOutBody')}
            action={<LinkButton to={ROUTES.welcome}>{t('profile.signIn')}</LinkButton>}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const bookingCount = bookings.filter((b) => b.status !== 'cancelled').length;
  const hairProfile =
    user.hairType && user.hairLength
      ? `${t(HAIR_TYPE_KEYS[user.hairType].label)} · ${t(HAIR_LENGTH_KEYS[user.hairLength].label)}`
      : t('profile.notSetYet');

  return (
    <Screen nav>
      <Header
        title={t('nav.profile')}
        actions={
          <IconButton label={t('profile.settingsTitle')} onClick={() => navigate(ROUTES.profileSettings)}>
            <Settings size={22} />
          </IconButton>
        }
      />
      <ScreenBody className="pf-screen stagger">
        {/* The membership card: who you are, what you can change, what you have
            done. One object with weight, so everything below it can sit quietly
            on the ground. Purely a wrapper — every child, prop and handler
            inside is exactly what it was. */}
        <div className="pf-identity">
          <ProfileHeader user={user} />

          {/* The only way to change anything about this profile. It used to be
              four — every account row was its own link to the same form, which
              made one edit screen look like four separate ones. */}
          <LinkButton
            to={ROUTES.profileEdit}
            variant="outline"
            pill
            icon={<Pencil size={16} aria-hidden="true" />}
            className="pf-edit"
          >
            {t('profile.editTitle')}
          </LinkButton>

          <nav className="pf-stats" aria-label={t('profile.activityLabel')}>
            <Link to={ROUTES.bookings} className="pf-stat">
              <strong>{formatNumber(bookingCount)}</strong>
              <span>{t('profile.statBookings')}</span>
            </Link>
            <Link to={ROUTES.profileReviews} className="pf-stat">
              <strong>{formatNumber(reviewCount)}</strong>
              <span>{t('profile.statReviews')}</span>
            </Link>
          </nav>
        </div>

        <section className="section" aria-labelledby="pf-account">
          <h3 className="label" id="pf-account">{t('profile.account')}</h3>
          <ListCard className="pf-list pf-list-flat">
            {/* Read-only on purpose — no `to`, so ListRow drops the chevron. */}
            <ListRow icon={<Phone size={18} aria-hidden="true" />} title={t('profile.phone')} sub={formatPhone(user.phone)} />
            <ListRow icon={<Mail size={18} aria-hidden="true" />} title={t('profile.email')} sub={user.email || t('profile.notSetYet')} />
            <ListRow icon={<Scissors size={18} aria-hidden="true" />} title={t('profile.hairProfile')} sub={hairProfile} />
            <ListRow icon={<MapPin size={18} aria-hidden="true" />} title={t('profile.location')} sub={user.location?.area || t('profile.notSetYet')} />
          </ListCard>
        </section>

        <section className="section" aria-labelledby="pf-more">
          <h3 className="label" id="pf-more">{t('profile.more')}</h3>
          <ListCard className="pf-list pf-list-flat">
            <ListRow icon={<CalendarDays size={18} aria-hidden="true" />} title={t('profile.myBookings')} end={formatNumber(bookingCount)} to={ROUTES.bookings} />
            <ListRow icon={<MessageSquare size={18} aria-hidden="true" />} title={t('profile.myReviews')} end={formatNumber(reviewCount)} to={ROUTES.profileReviews} />
            <ListRow icon={<Sparkles size={18} aria-hidden="true" />} title={t('profile.tryOnHistory')} to={ROUTES.tryOnHistory} />
            <ListRow icon={<LifeBuoy size={18} aria-hidden="true" />} title={t('profile.help')} to={ROUTES.help} />
          </ListCard>
        </section>

        <LogoutButton />
        <p className="pf-version">{t('profile.appVersion')}</p>
      </ScreenBody>
    </Screen>
  );
}
