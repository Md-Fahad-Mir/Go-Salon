import { startOfToday } from 'date-fns';
import {
  AlertCircle,
  BadgeCheck,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Share2,
  Zap,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ProfessionalLoading, ProfessionalNotFound } from '../booking/WizardShell';
import { ReviewCard } from '../booking/ReviewCard';
import { Art } from '../common/Art';
import { Avatar } from '../common/Avatar';
import { Badge } from '../common/Badge';
import { BottomSheet } from '../common/BottomSheet';
import { Button, LinkButton } from '../common/Button';
import { Callout } from '../common/Callout';
import { Carousel } from '../common/Carousel';
import { EmptyState } from '../common/EmptyState';
import { IconButton } from '../common/IconButton';
import { Price } from '../common/Price';
import { Rating } from '../common/Rating';
import { SectionHead } from '../common/SectionHead';
import { ListSkeleton } from '../common/Skeleton';
import { Spinner } from '../common/Spinner';
import { HomeFrame } from '../home/HomeFrame';
import { Header } from '../layout/Header';
import { Screen, ScreenBody } from '../layout/Screen';
import { StickyFooter } from '../layout/StickyFooter';
import { DEFAULT_LOCATION, ROUTES, WEEKDAYS } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useListingReviews } from '../../hooks/useReviews';
import type { TKey } from '../../i18n';
import type { Weekday } from '../../types';
import { todaysHours, weekdayOf } from '../../mockData';
import { useDirectoryStore } from '../../store/useDirectoryStore';
import { api } from '../../utils/api';
import { messageOf } from '../../utils/errorMessage';
import { useAppStore } from '../../store/useAppStore';
import { useBookingStore } from '../../store/useBookingStore';
import { directionsUrl, distanceKm } from '../../utils/geo';
import {
  firstNameOf,
  formatBdt,
  formatDistance,
  formatDuration,
  formatNumber,
  formatPhone,
  formatTime,
  toDateKey,
} from '../../utils/format';
import { shareOrCopy } from '../../utils/share';

/** The opening-hours table: WEEKDAY_LABELS in constants is English only. */
const WEEKDAY_KEYS: Record<Weekday, TKey> = {
  sun: 'booking.daySun',
  mon: 'booking.dayMon',
  tue: 'booking.dayTue',
  wed: 'booking.dayWed',
  thu: 'booking.dayThu',
  fri: 'booking.dayFri',
  sat: 'booking.daySat',
};

interface SalonProfileProps {
  /** `salon-3` / `barber-9` — the handle `/api/listings/` is addressed by. */
  listingId: string;
  /** Rendered as the customer's Home rather than as a screen they navigated
      to. There is no back arrow, because Home is where Back would go, and the
      notifications bell sits in the header, because Home is the one place it
      has always lived. While the listing is loading or has failed, Home's own
      frame is shown instead of the route's "Salon" screen, and a failure
      offers to try again rather than "back to home" — which, here, is the
      screen already open. */
  home?: boolean;
}

/* One salon, in full: the room, the menu, the team, the work, and the way to
   book. Lifted out of `ProfessionalDetailPage` so that the customer's Home can
   show the salon they are in without a second copy of this — the route form
   is now a `useParams` wrapper around it, and the rendered output of
   `/professional/:id` is pinned by its test to be exactly what it was. */
export function SalonProfile({ listingId, home = false }: SalonProfileProps) {
  const id = listingId;
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const hairstyleId = (location.state as { hairstyleId?: string } | null)?.hairstyleId;
  const hoursId = useId();

  const toast = useAppStore((s) => s.toast);
  const userLocation = useAppStore((s) => s.user?.location);
  // A number, so a store write that leaves the count unchanged is not a
  // re-render of this whole screen. Read on every route, used only on Home.
  const unread = useAppStore((s) => s.notifications.filter((n) => !n.read).length);
  const start = useBookingStore((s) => s.start);

  const [hoursOpen, setHoursOpen] = useState(false);
  const [photo, setPhoto] = useState<number | null>(null);

  /* The three most recent reviews, from the server. The star and the count
     beside them come off the listing itself, which the same database counted
     — so the two figures on this screen cannot drift apart. */
  const { reviews: latest, loading: reviewsLoading } = useListingReviews(id);

  /* The listing is fetched, and cached as it arrives. A second visit renders
     from the cache immediately and refreshes underneath, so coming back from
     the booking wizard is not a spinner.

     Two different things are cached, though, and only one of them is the menu.
     A search result is a *list* row — a name, a photo, a price range — and it
     carries no services at all. Treating its presence as "loaded" is what made
     a salon's menu vanish: the page had everything it needed to render, so it
     rendered, with nothing on the menu and nothing to say why. `servicesById`
     is the honest test, because only a detail response writes it. */
  const cached = useDirectoryStore((s) => s.byId[id]);
  // Subscribed, not read through getState(): the menu arrives after the first
  // paint, and a non-reactive read would leave it empty until something else
  // happened to re-render this screen.
  const services = useDirectoryStore((s) => s.servicesById[id]);
  const staff = useDirectoryStore((s) => s.staffById[id]) ?? [];
  const [attempt, setAttempt] = useState(0);
  /* Tagged with the request it belongs to, so a retry or a different salon
     invalidates it without an effect having to clear it first. */
  const [failed, setFailed] = useState<{ key: string; detail: string } | null>(null);
  const requestKey = `${id}|${attempt}`;
  const failure = failed?.key === requestKey ? failed.detail : undefined;
  const loaded = services !== undefined;

  useEffect(() => {
    let live = true;
    const point = userLocation ?? DEFAULT_LOCATION;
    api.professionals.get(id, point).catch((error: unknown) => {
      if (live) setFailed({ key: requestKey, detail: messageOf(error) });
    });
    return () => {
      live = false;
    };
  }, [id, userLocation, requestKey]);

  if (!cached) {
    if (home) {
      return (
        <HomeFrame center>
          {failure ? (
            <EmptyState
              icon={<AlertCircle size={26} aria-hidden="true" />}
              tone="danger"
              title={t('state.loadFailedTitle')}
              description={failure}
              action={<Button onClick={() => setAttempt((n) => n + 1)}>{t('state.retry')}</Button>}
            />
          ) : (
            <Spinner size="lg" label={t('state.loading')} />
          )}
        </HomeFrame>
      );
    }
    if (!failure) return <ProfessionalLoading />;
    return <ProfessionalNotFound nav detail={failure} />;
  }

  const pro = cached;
  const km = distanceKm(userLocation ?? DEFAULT_LOCATION, pro.location);
  const open = pro.openNow;
  const today = todaysHours(pro);
  const todayKey = weekdayOf(toDateKey(startOfToday()));
  const photos = pro.gallery.slice(0, 6);
  const covers = pro.gallery.length
    ? pro.gallery
    : [{ id: 0, image: pro.coverImage || pro.avatar, caption: '' }];
  const reviewsRoute = ROUTES.professionalReviews(pro.id);

  const book = () => {
    start(pro.id, { hairstyleId });
    navigate(ROUTES.bookingStaff(pro.id));
  };
  const bookWith = (staffId: string) => {
    start(pro.id, { staffId, serviceIds: [], hairstyleId });
    navigate(ROUTES.bookingStaff(pro.id));
  };
  const onShare = async () => {
    const result = await shareOrCopy({
      title: pro.name,
      text: t('booking.proShareText', { name: pro.name, tagline: pro.tagline }),
    });
    if (result === 'copied') toast('success', t('booking.linkCopied'), t('booking.linkCopiedBody'));
    else if (result === 'shared') toast('success', t('booking.shared'));
    else toast('error', t('booking.shareFailed'), t('booking.shareFailedBody'));
  };

  return (
    <Screen nav className="pro-screen">
      <Header
        back={!home}
        transparent
        actions={
          /* The heart went with Saved. Favourites were a shortlist across
             salons a customer had not joined, which is the shape of thing
             this app no longer has — the salons they belong to *are* the
             list, and they are in Settings. */
          <>
            {home ? (
              <IconButton
                label={
                  unread
                    ? t('home.notificationsUnread', { count: formatNumber(unread) })
                    : t('home.notifications')
                }
                dot={unread > 0}
                variant="scrim"
                onClick={() => navigate(ROUTES.notifications)}
              >
                <Bell size={22} />
              </IconButton>
            ) : null}
            <IconButton label={t('action.share')} variant="scrim" onClick={onShare}>
              <Share2 size={20} />
            </IconButton>
          </>
        }
      />
      <ScreenBody flush>
        <Carousel counter dots label={t('booking.proPhotos', { name: pro.name })}>
          {covers.map((cover: { id: number; image: string; caption: string }, index: number) => (cover.image ? (
            <img
              key={cover.id}
              src={cover.image}
              className="pro-cover-banner"
              alt={cover.caption || t('booking.proPhotoAlt', { name: pro.name, index: formatNumber(index + 1) })}
            />
          ) : (
            <Art
              key={cover.id}
              tone={index}
              ratio="banner"
              flat
              alt={t('booking.proPhotoAlt', { name: pro.name, index: formatNumber(index + 1) })}
            />
          )))}
        </Carousel>

        <div className="pro-body stagger">
          <div className="pro-head">
            {/* The business's own picture, where it has set one. The covers
                above are the room; this is who the room belongs to. */}
            {pro.avatar ? (
              <Avatar name={pro.name} src={pro.avatar} size="xl" ring className="pro-head-avatar" />
            ) : null}
            <h2>{pro.name}</h2>
            <div className="pro-badges">
              <Badge tone={pro.type === 'barber' ? 'accent' : 'sage'} plain pill>
                {pro.type === 'barber' ? t('biz.barber') : t('biz.salon')}
              </Badge>
              {pro.verified ? (
                <Badge tone="info" plain pill>
                  <BadgeCheck size={13} aria-hidden="true" /> {t('status.verified')}
                </Badge>
              ) : null}
              {open ? (
                <Badge tone="success" pill>{t('status.openNow')}</Badge>
              ) : (
                <Badge tone="neutral" pill>{t('status.closedNow')}</Badge>
              )}
            </div>
            <div className="pro-rating-row">
              {pro.reviewCount > 0 && pro.rating !== null ? (
                <>
                  <Rating value={pro.rating} count={pro.reviewCount} size={15} />
                  <LinkButton to={reviewsRoute} variant="ghost" size="xs" className="link-btn">
                    {t('booking.seeReviews')}
                  </LinkButton>
                </>
              ) : (
                <span className="caption dim">{t('booking.noReviewsYet')}</span>
              )}
            </div>
            <p className="caption pro-tagline">{pro.tagline}</p>
          </div>

          <div className="list-card">
            <div className="list-row">
              <span className="list-row-icon"><MapPin size={18} aria-hidden="true" /></span>
              <span className="list-row-body">
                <span className="list-row-title">{pro.location.address}</span>
                <span className="list-row-sub">
                  {t('booking.distanceFromYou', { distance: formatDistance(km), area: pro.location.area })}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="list-row pro-hours-toggle"
              aria-expanded={hoursOpen}
              aria-controls={hoursId}
              onClick={() => setHoursOpen((value) => !value)}
            >
              <span className="list-row-icon"><Clock size={18} aria-hidden="true" /></span>
              <span className="list-row-body">
                <span className="list-row-title">
                  {today.length === 0
                    ? t('booking.closedToday')
                    : today
                        .map((stretch) =>
                          t('booking.hoursRange', {
                            open: formatTime(stretch.start),
                            close: formatTime(stretch.end),
                          }),
                        )
                        .join(', ')}
                </span>
                <span className="list-row-sub">{open ? t('status.openNow') : t('booking.closedRightNow')}</span>
              </span>
              <span className="list-row-end">
                {t('booking.hours')} <ChevronDown size={18} className="pro-chevron" aria-hidden="true" />
              </span>
            </button>
            <dl id={hoursId} className="pro-hours" hidden={!hoursOpen}>
              {WEEKDAYS.map((day) => {
                const entry = pro.hours.find((row) => row.day === day);
                const stretches = entry && !entry.closed ? entry.intervals : [];
                return (
                  <div
                    key={day}
                    className="pro-hours-day"
                    data-today={day === todayKey ? 'true' : undefined}
                    data-closed={stretches.length === 0 ? 'true' : undefined}
                  >
                    <dt>{t(WEEKDAY_KEYS[day])}</dt>
                    <dd>
                      {stretches.length === 0
                        ? t('booking.closed')
                        : stretches
                            .map((stretch) =>
                              t('booking.hoursRange', {
                                open: formatTime(stretch.start),
                                close: formatTime(stretch.end),
                              }),
                            )
                            .join(', ')}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <a href={`tel:${pro.phone}`} className="list-row">
              <span className="list-row-icon"><Phone size={18} aria-hidden="true" /></span>
              <span className="list-row-body">
                <span className="list-row-title">{formatPhone(pro.phone)}</span>
                <span className="list-row-sub">{t('booking.tapToCall')}</span>
              </span>
            </a>
          </div>

          <div className="pro-actions">
            <a className="btn btn-secondary" href={`tel:${pro.phone}`}>
              <Phone size={18} aria-hidden="true" /> {t('action.call')}
            </a>
            <a className="btn btn-secondary" href={directionsUrl(pro.location)} target="_blank" rel="noreferrer">
              <Navigation size={18} aria-hidden="true" /> {t('action.directions')}
            </a>
            {pro.email ? (
              <a
                className="btn btn-secondary"
                href={`mailto:${pro.email}`}
                aria-label={t('booking.emailAria', { address: pro.email })}
              >
                <Mail size={18} aria-hidden="true" /> {t('profile.email')}
              </a>
            ) : null}
          </div>

          <section className="section">
            <SectionHead title={t('booking.about')} />
            <p className="pro-about muted">{pro.bio}</p>
          </section>

          {/* Three different things, said differently. Still arriving is a
              skeleton; a menu that could not be fetched says so and offers to
              try again; a salon that has genuinely priced nothing says that.
              All three used to render as an empty list. */}
          <section className="section">
            <SectionHead title={t('booking.services')} />
            {!loaded ? (
              failure ? (
                <Callout
                  tone="danger"
                  icon={<AlertCircle size={18} aria-hidden="true" />}
                  title={t('booking.menuFailedTitle')}
                >
                  {failure}
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                      {t('action.retry')}
                    </Button>
                  </div>
                </Callout>
              ) : (
                <ListSkeleton rows={3} />
              )
            ) : services.length === 0 ? (
              <p className="muted">{t('booking.menuEmpty')}</p>
            ) : (
              <>
                <div className="list-card">
                  {services.slice(0, 4).map((service) => (
                    <div key={service.id} className="list-row">
                      <span className="list-row-body">
                        <span className="list-row-title">{service.name}</span>
                        <span className="list-row-sub">
                          {service.popular
                            ? t('booking.durationPopular', { duration: formatDuration(service.duration) })
                            : formatDuration(service.duration)}
                        </span>
                      </span>
                      <span className="list-row-end"><Price value={service.price} /></span>
                    </div>
                  ))}
                </div>
                <button type="button" className="link-btn" onClick={book}>
                  {t('booking.seeAllServices', { count: formatNumber(services.length) })}{' '}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </section>

          <section className="section">
            <SectionHead title={t('booking.meetTeam')} />
            <div className="hscroll bleed pro-team">
              {staff.map((member) => (
                <article key={member.id} className="pro-staff-card">
                  <Avatar name={member.name} accent size="lg" />
                  <div className="stack-xs">
                    <strong className="pro-staff-name">{member.name}</strong>
                    <span className="small muted">{member.title}</span>
                    {member.reviewCount > 0 && member.rating !== null ? (
                      <Rating value={member.rating} count={member.reviewCount} size={12} />
                    ) : (
                      <span className="tiny dim">{t('biz.newHere')}</span>
                    )}
                    <span className="tiny dim clamp-2">{member.specialties.join(' · ')}</span>
                  </div>
                  <Button size="xs" variant="accent-soft" onClick={() => bookWith(member.id)}>
                    {t('booking.bookWith', { name: firstNameOf(member.name) })}
                  </Button>
                </article>
              ))}
            </div>
          </section>

          {/* The work, as a mosaic rather than a row of equal squares: the
              first shot leads and the rest support it.

              Sized by how many there actually are. Most salons here have one
              photograph, and a six-up grid holding a single tile reads as a
              page that failed to load — so one photo becomes a full-width
              feature, two split the row, and only from three does it become a
              mosaic. `data-count` carries the decision to CSS. */}
          <section className="section">
            <SectionHead title={t('booking.portfolio')} />
            {photos.length ? (
              <div className="pro-mosaic" data-count={Math.min(photos.length, 6)}>
                {photos.map((shot, index) => (
                  <button
                    key={shot.id}
                    type="button"
                    className="pro-shot"
                    onClick={() => setPhoto(index)}
                    aria-label={t('booking.openPhoto', { index: formatNumber(index + 1), total: formatNumber(photos.length) })}
                  >
                    <img src={shot.image} alt={shot.caption} loading="lazy" decoding="async" />
                    {shot.caption ? <span className="pro-shot-caption">{shot.caption}</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="caption">{t('booking.portfolioEmpty', { name: pro.name })}</p>
            )}
          </section>

          <section className="section">
            <SectionHead title={t('booking.reviews')} action={{ label: t('action.seeAll'), to: reviewsRoute }} />
            {pro.reviewCount > 0 && pro.rating !== null ? (
              <div className="row-sm">
                <Rating value={pro.rating} size={16} />
                <span className="caption">· {t('biz.reviews', { count: formatNumber(pro.reviewCount) })}</span>
              </div>
            ) : null}
            {reviewsLoading ? (
              <ListSkeleton rows={2} />
            ) : latest.length ? (
              <div className="stack-sm">
                {latest.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} />)}
              </div>
            ) : (
              <p className="caption">{t('booking.noWrittenReviews')}</p>
            )}
            {pro.reviewCount > 0 ? (
              <LinkButton to={reviewsRoute} variant="outline" block>
                {t('booking.seeAllReviews', { count: formatNumber(pro.reviewCount) })}
              </LinkButton>
            ) : null}
          </section>

          <section className="section">
            <SectionHead title={t('booking.goodToKnow')} />
            <div className="pro-badges">
              {pro.amenities.map((amenity) => (
                <Badge key={amenity} tone="neutral" plain pill>{amenity}</Badge>
              ))}
            </div>
          </section>
        </div>
      </ScreenBody>

      <StickyFooter
        meta={
          <>
            <span>
              {pro.priceFrom === null
                ? t('biz.noPricesYet')
                : <>{t('biz.from')} <strong>{formatBdt(pro.priceFrom)}</strong></>}
            </span>
            <span className="row-xs">
              {pro.acceptance === 'auto' ? <Zap size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
              {pro.acceptance === 'auto' ? t('biz.instantConfirm') : t('biz.manualApproval')}
            </span>
          </>
        }
      >
        <Button block size="lg" onClick={book}>{t('booking.bookAppointment')}</Button>
      </StickyFooter>

      <BottomSheet
        open={photo !== null}
        onClose={() => setPhoto(null)}
        title={photo !== null ? t('booking.photoOf', { index: formatNumber(photo + 1), total: formatNumber(photos.length) }) : undefined}
      >
        {photo !== null ? (
          <div className="pro-lightbox">
            <img
              src={photos[photo].image}
              className="pro-lightbox-img"
              alt={photos[photo].caption
                || t('booking.portfolioAlt', { name: pro.name, index: formatNumber(photo + 1) })}
            />
            <div className="pro-lightbox-nav">
              <Button
                variant="secondary"
                size="sm"
                icon={<ChevronLeft size={16} aria-hidden="true" />}
                disabled={photo === 0}
                onClick={() => setPhoto(photo - 1)}
              >
                {t('booking.previous')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                iconEnd={<ChevronRight size={16} aria-hidden="true" />}
                disabled={photo === photos.length - 1}
                onClick={() => setPhoto(photo + 1)}
              >
                {t('action.next')}
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
