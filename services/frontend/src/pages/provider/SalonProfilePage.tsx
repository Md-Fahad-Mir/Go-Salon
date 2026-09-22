import {
  BadgeCheck,
  BarChart3,
  Clock,
  Images,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Pencil,
  Scissors,
  Store,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES, WEEKDAYS } from '../../constants';
import { Art } from '../../components/common/Art';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { Button, LinkButton } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Carousel } from '../../components/common/Carousel';
import { EmptyState } from '../../components/common/EmptyState';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { Price } from '../../components/common/Price';
import { Rating } from '../../components/common/Rating';
import { Spinner } from '../../components/common/Spinner';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ExternalButton } from '../../components/profile/ExternalButton';
import { GalleryGrid } from '../../components/provider/business/GalleryGrid';
import { WeekHoursSheet } from '../../components/provider/hours/WeekHoursSheet';
import {
  SalonDetailsSheet,
} from '../../components/provider/salon/SalonProfileSheets';
import { WEEKDAY_LONG_KEYS } from '../../components/provider/salon/salonLabels';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import { messageOf } from '../../utils/errorMessage';
import { formatBdt, formatDuration, formatNumber, formatPhone, formatTime } from '../../utils/format';
import { directionsUrl } from '../../utils/geo';

/* One line of explanation per review state, so the owner always knows what
   happens next rather than staring at a badge. */
/** Enough of the menu and the roster to give the shape of the place; the
    rest is one tap away on the screen that manages it. */
const MENU_PREVIEW = 6;
const TEAM_PREVIEW = 5;

export default function SalonProfilePage() {
  const t = useT();
  /* The shopfront's score, counted by the server over every review of this
     salon. `/api/reviews/` scopes itself to the account asking, so an owner
     gets their own salon and nothing else. */
  const { summary: reviews } = useMyReviews();
  const profile = useProviderStore((s) => s.profile);
  const updateProfile = useProviderStore((s) => s.updateProfile);
  const setAutoAccept = useProviderStore((s) => s.setAutoAccept);
  const toast = useAppStore((s) => s.toast);

  const services = useProviderStore((s) => s.services);
  const staff = useProviderStore((s) => s.staff);
  const schedule = useProviderStore((s) => s.schedule);
  const saveSchedule = useProviderStore((s) => s.saveSchedule);
  const status = useProviderStore((s) => s.status);
  const error = useProviderStore((s) => s.error);
  const load = useProviderStore((s) => s.load);

  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'details' | 'hours' | null>(null);
  const [savingHours, setSavingHours] = useState(false);

  /** Every write on this screen ends the same way: tell them, or say why not. */
  const save = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast('success', done);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    }
  };

  /* Still loading, failed, or genuinely nothing yet. All three keep the one
     control that has nothing to do with the salon — signing out. */
  if (!profile) {
    return (
      <Screen nav>
        <Header title={t('salon.profileTitle')} />
        <ScreenBody className="fullscreen-center">
          {status === 'loading' ? (
            <Spinner size="lg" label={t('state.loading')} />
          ) : status === 'error' ? (
            <EmptyState
              icon={<Store size={26} aria-hidden="true" />}
              title={t('state.loadFailedTitle')}
              description={error ?? undefined}
              action={<Button onClick={() => void load()}>{t('state.retry')}</Button>}
            />
          ) : (
            <EmptyState
              icon={<Store size={26} aria-hidden="true" />}
              title={t('pb.noProfileTitle')}
              description={t('pb.noProfileBody')}
            />
          )}
          {/* Signing out lives in Settings now — one tab along — so somebody
              stuck on an empty salon is pointed there rather than given a
              second copy of the button. */}
          <LinkButton variant="ghost" to={ROUTES.proSettings}>{t('nav.settings')}</LinkButton>
        </ScreenBody>
      </Screen>
    );
  }

  const todayKey = WEEKDAYS[new Date().getDay()];
  const week = schedule?.days ?? [];
  /* Only what the salon is actually offering today. A retired service and a
     chair that has left are history, and a portfolio is not a history. */
  const activeServices = services.filter((service) => service.active);
  const activeStaff = staff.filter((member) => member.active);
  const priceFrom = activeServices.length
    ? Math.min(...activeServices.map((service) => service.price))
    : null;
  /* The carousel shows the gallery when there is one, and falls back to the
     single cover image, and to placeholder art when there is neither. */
  const covers = profile.gallery.length
    ? profile.gallery.map((item) => ({ key: String(item.id), image: item.image, caption: item.caption }))
    : [{ key: 'cover', image: profile.coverImage, caption: '' }];

  return (
    <Screen nav>
      <Header title={t('salon.profileTitle')} />
      <ScreenBody className="sp-shop">
        <div className="ps-cover sp-cover">
          {/* The shopfront: whatever the salon has uploaded, and a plain
              placeholder until it has uploaded anything. */}
          <Carousel counter dots label={profile.businessName}>
            {covers.map((cover, index) =>
              cover.image ? (
                <img
                  key={cover.key}
                  src={cover.image}
                  alt={cover.caption || t('salon.coverAlt', { index: formatNumber(index + 1) })}
                  className="ps-cover-photo"
                />
              ) : (
                <Art
                  key={cover.key}
                  tone={index}
                  ratio="banner"
                  flat
                  alt={t('salon.coverAlt', { index: formatNumber(index + 1) })}
                />
              ),
            )}
          </Carousel>
          <div className="ps-cover-badges">
            {profile.verification === 'verified' ? (
              <Badge tone="solid" pill>
                <BadgeCheck size={13} aria-hidden="true" /> {t('pro.verified')}
              </Badge>
            ) : null}
            {profile.womenOnly ? <Badge tone="dark" pill>{t('pro.womenOnly')}</Badge> : null}
          </div>
        </div>

        {/* The shopfront picture sits against the cover, the way a logo sits
            on a signboard — the cover is the room, this is the business. */}
        <div className="sp-identity">
          <Avatar name={profile.businessName} src={profile.avatar || undefined} size="xl" ring />
          <div className="stack-xs grow">
            <h2 className="sp-name">{profile.businessName}</h2>
            <p className="caption sp-tagline">{profile.tagline}</p>
            {reviews && reviews.count > 0 && reviews.average !== null ? (
              <Rating value={reviews.average} count={reviews.count} />
            ) : null}
          </div>
        </div>

        <p className="muted sp-bio">{profile.bio}</p>

        <Button
          variant="outline"
          block
          className="sp-edit"
          icon={<Pencil size={18} aria-hidden="true" />}
          onClick={() => setSheet('details')}
        >
          {t('salon.editDetails')}
        </Button>

        {/* --- At a glance -------------------------------------------------
            The three numbers somebody forms an impression from before they
            read anything: how many chairs, how long the menu is, and what it
            starts at. `price_from` is null when nothing is priced, and the
            card says so rather than showing a confident zero. */}
        <div className="pro-stats ps-stats-2 sp-glance" aria-label={t('salon.glanceTitle')}>
          <div className="pro-stat">
            <strong>{formatNumber(activeStaff.length)}</strong>
            <span>{t('salon.glanceStaff')}</span>
          </div>
          <div className="pro-stat">
            <strong>{formatNumber(activeServices.length)}</strong>
            <span>{t('salon.glanceServices')}</span>
          </div>
          <div className="pro-stat pro-stat-accent">
            <strong>{priceFrom === null ? '—' : formatBdt(priceFrom)}</strong>
            <span>{priceFrom === null ? t('salon.noPrices') : t('salon.glanceFrom')}</span>
          </div>
        </div>

        {/* --- Contact ------------------------------------------------------ */}
        <section className="section" aria-labelledby="sp-contact">
          <h3 className="label ps-chapter" id="sp-contact">{t('salon.contactSection')}</h3>
          <ListCard className="sp-list sp-icons">
            {profile.phone ? (
              <ListRow
                icon={<Phone size={18} aria-hidden="true" />}
                title={formatPhone(profile.phone)}
                sub={t('salon.callSalon')}
                href={`tel:${profile.phone}`}
              />
            ) : null}
            {profile.email ? (
              <ListRow
                icon={<Mail size={18} aria-hidden="true" />}
                title={profile.email}
                sub={t('salon.emailSalon')}
                href={`mailto:${profile.email}`}
              />
            ) : null}
          </ListCard>
        </section>

        {/* --- The menu -----------------------------------------------------
            Only the active ones: a retired service is not part of what this
            salon offers, and the portfolio is the offer. */}
        <section className="section" aria-labelledby="sp-menu">
          <div className="ps-edit-head">
            <h3 className="label" id="sp-menu">{t('salon.menuSection')}</h3>
            <button type="button" onClick={() => navigate(ROUTES.proSalonServices)}>
              {t('salon.menuManage')} <Scissors size={14} aria-hidden="true" />
            </button>
          </div>
          {activeServices.length ? (
            <ListCard className="sp-list sp-menu">
              {activeServices.slice(0, MENU_PREVIEW).map((service) => (
                <ListRow
                  key={service.id}
                  title={service.name}
                  sub={formatDuration(service.duration)}
                  end={<Price value={service.price} />}
                  chevron={false}
                />
              ))}
              {activeServices.length > MENU_PREVIEW ? (
                <ListRow
                  title={t('salon.menuMore', { count: formatNumber(activeServices.length - MENU_PREVIEW) })}
                  to={ROUTES.proSalonServices}
                />
              ) : null}
            </ListCard>
          ) : (
            <p className="muted">{t('salon.menuEmpty')}</p>
          )}
        </section>

        {/* --- The team ----------------------------------------------------- */}
        <section className="section" aria-labelledby="sp-team">
          <div className="ps-edit-head">
            <h3 className="label" id="sp-team">{t('salon.teamSection')}</h3>
            <button type="button" onClick={() => navigate(ROUTES.proSalonStaff)}>
              {t('salon.teamManage')} <Users size={14} aria-hidden="true" />
            </button>
          </div>
          {activeStaff.length ? (
            <ListCard className="sp-list">
              {activeStaff.slice(0, TEAM_PREVIEW).map((member) => (
                <ListRow
                  key={member.id}
                  icon={<Avatar name={member.name} src={member.avatar} size="sm" />}
                  title={member.name}
                  sub={member.title || (member.specialties.length ? member.specialties.join(' · ') : undefined)}
                  to={ROUTES.proSalonStaffMember(member.id)}
                />
              ))}
              {activeStaff.length > TEAM_PREVIEW ? (
                <ListRow title={t('salon.allStaff', { count: formatNumber(activeStaff.length) })} to={ROUTES.proSalonStaff} />
              ) : null}
            </ListCard>
          ) : (
            <p className="muted">{t('salon.emptyStaffBody')}</p>
          )}
        </section>

        <section className="section" aria-labelledby="sp-hours">
          <div className="ps-edit-head">
            <h3 className="label" id="sp-hours">{t('salon.openingHours')}</h3>
            <button type="button" onClick={() => setSheet('hours')}>
              {t('action.edit')} <Clock size={14} aria-hidden="true" />
            </button>
          </div>
          {/* An unsaved week is not the salon's hours, however much it looks
              like them: customers see this salon as closed every day and the
              calendar greys out every date. */}
          {schedule?.source === 'default' ? (
            <Callout tone="warning" title={t('hours.unsavedTitle')}>
              {t('hours.unsavedBody')}
            </Callout>
          ) : null}
          <div className="card card-pad sp-week-card">
            <dl className="kv sp-week">
              {WEEKDAYS.map((day) => {
                const entry = week.find((row) => row.day === day);
                const closed = !entry || entry.closed || entry.intervals.length === 0;
                return (
                  <div
                    key={day}
                    className="ps-hour-row"
                    data-today={day === todayKey ? 'true' : undefined}
                    data-closed={closed ? 'true' : undefined}
                  >
                    <dt>{t(WEEKDAY_LONG_KEYS[day])}</dt>
                    <dd>
                      {closed
                        ? t('salon.closedLabel')
                        : entry.intervals
                            .map((interval) =>
                              t('salon.hoursRange', {
                                open: formatTime(interval.start),
                                close: formatTime(interval.end),
                              }),
                            )
                            .join(', ')}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>

        <section className="section" aria-labelledby="sp-location">
          <h3 className="label ps-chapter" id="sp-location">{t('salon.location')}</h3>
          <div className="card card-pad stack-sm sp-place">
            <p className="row-sm">
              <MapPin size={18} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
              <span>{profile.location.address}</span>
            </p>
            <p className="caption">{profile.location.area}</p>
            <p className="row-sm">
              <Phone size={18} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
              <span>{formatPhone(profile.phone)}</span>
            </p>
            <ExternalButton
              href={directionsUrl(profile.location)}
              variant="outline"
              size="sm"
              icon={<Navigation size={16} aria-hidden="true" />}
            >
              {t('action.directions')}
            </ExternalButton>
          </div>
        </section>



        <section className="section" aria-labelledby="sp-bookings">
          <h3 className="label ps-chapter" id="sp-bookings">{t('salon.bookingsSection')}</h3>
          <div className="card card-pad">
            <Toggle
              checked={profile.autoAccept}
              onChange={(on) => void setAutoAccept(on)}
              label={t('pro.autoAccept')}
              hint={t('pro.autoAcceptHint')}
            />
          </div>
        </section>

        {/* --- Gallery ------------------------------------------------------
            The carousel at the top already shows these; this is where they are
            counted and managed from. */}
        <section className="section" aria-labelledby="sp-gallery">
          <div className="ps-edit-head">
            <h3 className="label" id="sp-gallery">{t('salon.gallerySection')}</h3>
            <button type="button" onClick={() => navigate(ROUTES.proPortfolio)}>
              {t('salon.galleryManage')} <Images size={14} aria-hidden="true" />
            </button>
          </div>
          <GalleryGrid images={profile.gallery} empty={<p className="muted">{t('salon.galleryEmpty')}</p>} />
        </section>

        {/* Analytics is the salon's own numbers, so it hangs off the salon
            rather than off Settings, which is the app's own business. */}
        <section className="section" aria-labelledby="sp-numbers">
          <h3 className="label ps-chapter" id="sp-numbers">{t('salon.numbersSection')}</h3>
          <ListCard className="sp-list sp-icons">
            <ListRow
              icon={<BarChart3 size={18} aria-hidden="true" />}
              title={t('nav.analytics')}
              sub={t('salon.numbersRowHint')}
              to={ROUTES.proSalonAnalytics}
            />
          </ListCard>
        </section>
      </ScreenBody>

      <SalonDetailsSheet
        key={`details-${sheet === 'details'}`}
        open={sheet === 'details'}
        onClose={() => setSheet(null)}
        profile={profile}
        onSave={(patch) => void save(() => updateProfile(patch), t('salon.detailsSavedToast'))}
      />

      {sheet === 'hours' && schedule ? (
        <WeekHoursSheet
          open
          week={schedule.days}
          saving={savingHours}
          title={t('salon.editHours')}
          onClose={() => setSheet(null)}
          onCopyAll={() => toast('info', t('salon.copiedToast'))}
          onSave={async (days) => {
            setSavingHours(true);
            await save(() => saveSchedule(days), t('salon.hoursSavedToast'));
            setSavingHours(false);
            setSheet(null);
          }}
        />
      ) : null}


    </Screen>
  );
}
