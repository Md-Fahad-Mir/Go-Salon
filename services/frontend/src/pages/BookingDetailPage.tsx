import { addMinutes, formatDistanceToNowStrict as distanceToNowStrict, isPast, isToday } from 'date-fns';
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Info,
  MapPin,
  Navigation,
  Phone,
  Receipt,
  RotateCcw,
  Scissors,
  SearchX,
  Share2,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Booking } from '../types';
import { ROUTES } from '../constants';
import { Badge, StatusBadge } from '../components/common/Badge';
import { Button, LinkButton } from '../components/common/Button';
import { Callout } from '../components/common/Callout';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { IconButton } from '../components/common/IconButton';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { CancelDialog } from '../components/profile/CancelDialog';
import { ExternalButton } from '../components/profile/ExternalButton';
import { PolicySheet } from '../components/profile/PolicySheet';
import { ReceiptSheet } from '../components/profile/ReceiptSheet';
import { ReviewSheet } from '../components/profile/ReviewSheet';
import { bookingStart, cancelReasonLabel, isUpcoming, servicesLabel } from '../components/profile/bookingHelpers';
import { useBookingActions } from '../components/profile/useBookingActions';
import { useT } from '../hooks/useLanguage';
import type { TFunction } from '../i18n';
import { getProfessional } from '../store/useDirectoryStore';
import { useAppStore } from '../store/useAppStore';
import { api } from '../utils/api';
import { formatBdt, formatDateLong, formatDayLabel, formatDuration, formatNumber, formatTime, formatTimeRange } from '../utils/format';
import { directionsUrl } from '../utils/geo';
import { activeDateLocale } from '../utils/locale';
import { buildIcs, downloadText, shareOrCopy } from '../utils/share';

type Sheet = 'cancel' | 'review' | 'receipt' | 'policy' | null;

const heroFor = (
  booking: Booking,
  t: TFunction,
): { title: string; caption: string; icon: 'success' | 'warning' | 'neutral' | 'danger' } => {
  const start = bookingStart(booking);
  switch (booking.status) {
    case 'approved':
      return {
        title: t('bookings.heroConfirmed'),
        caption: isToday(start)
          ? t('bookings.heroTodayAt', { time: formatTime(booking.time) })
          : isPast(start)
            ? t('bookings.heroAgo', { distance: formatDistanceToNowStrict(start) })
            : t('bookings.heroIn', { distance: formatDistanceToNowStrict(start) }),
        icon: 'success',
      };
    case 'pending':
      return {
        title: t('bookings.heroPending'),
        caption: t('bookings.heroPendingCaption', { name: booking.professionalName }),
        icon: 'warning',
      };
    case 'completed':
      return { title: t('bookings.heroCompleted'), caption: formatDateLong(start), icon: 'neutral' };
    default:
      return {
        title: t('bookings.heroCancelled'),
        caption: booking.cancelReason
          ? cancelReasonLabel(booking.cancelReason, t)
          : t('bookings.heroCancelledCaption'),
        icon: 'danger',
      };
  }
};

/** date-fns' own helper needs the active locale handed to it, the way
    utils/format does for every other date on the screen. */
const formatDistanceToNowStrict = (date: Date): string =>
  distanceToNowStrict(date, { locale: activeDateLocale() });

const HERO_ICONS = { success: CheckCircle2, warning: Clock, neutral: Sparkles, danger: XCircle } as const;

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useAppStore((s) => (id ? s.bookings.find((b) => b.id === id) : undefined));
  const bookings = useAppStore((s) => s.bookings);
  const toast = useAppStore((s) => s.toast);
  const rememberBooking = useAppStore((s) => s.rememberBooking);
  const { rebook, reschedule } = useBookingActions();
  const [sheet, setSheet] = useState<Sheet>(null);
  const t = useT();

  /* Always re-read: a salon may have approved or turned this down since the
     list was fetched, and this screen is where a customer comes to find out. */
  useEffect(() => {
    if (!id) return;
    let live = true;
    api.bookings
      .get(id)
      .then((fresh) => live && rememberBooking(fresh))
      .catch(() => {
        /* Keep whatever is cached; the screen still renders it. */
      });
    return () => {
      live = false;
    };
  }, [id, rememberBooking]);

  const movedFrom = booking?.rescheduledFromId
    ? bookings.find((entry) => entry.id === booking.rescheduledFromId)
    : undefined;

  if (!booking) {
    return (
      <Screen nav>
        <Header title={t('bookings.detailTitle')} back backTo={ROUTES.bookings} />
        <ScreenBody className="fullscreen-center">
          <EmptyState
            icon={<SearchX size={26} aria-hidden="true" />}
            title={t('bookings.notFoundTitle')}
            description={t('bookings.notFoundBody')}
            action={<LinkButton to={ROUTES.bookings}>{t('bookings.myBookings')}</LinkButton>}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const pro = getProfessional(booking.professionalId);
  const start = bookingStart(booking);
  const hero = heroFor(booking, t);
  const HeroIcon = HERO_ICONS[hero.icon];
  const upcoming = isUpcoming(booking);
  // The review of this visit, as the server sent it with the booking.
  const review = booking.review;
  const services = servicesLabel(booking);

  const share = async () => {
    const result = await shareOrCopy({
      title: t('bookings.shareTitle'),
      text: t('bookings.shareText', {
        services,
        pro: booking.professionalName,
        day: formatDayLabel(booking.date),
        time: formatTime(booking.time),
      }),
    });
    if (result === 'copied') toast('info', t('bookings.linkCopied'), t('bookings.pasteAnywhere'));
    if (result === 'failed') toast('error', t('bookings.shareFailed'), t('bookings.tryAgainMoment'));
  };

  const addToCalendar = () => {
    const ics = buildIcs({
      title: t('bookings.servicesAt', { services, pro: booking.professionalName }),
      description: t('bookings.icsDescription', { staff: booking.staffName, id: booking.id }),
      location: pro?.location.address ?? booking.professionalName,
      start,
      end: addMinutes(start, booking.duration),
    });
    downloadText(`eureka-${booking.id}.ics`, ics);
    toast('success', t('bookings.calendarSaved'), t('bookings.calendarSavedBody'));
  };

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(booking.id);
      toast('success', t('bookings.refCopied'), booking.id);
    } catch {
      toast('error', t('bookings.copyFailed'), booking.id);
    }
  };

  return (
    <Screen nav className="bkl-detail">
      <Header
        title={t('bookings.detailTitle')}
        back
        backTo={ROUTES.bookings}
        actions={
          <IconButton label={t('bookings.shareLabel')} onClick={share}>
            <Share2 size={20} />
          </IconButton>
        }
      />
      <ScreenBody>
        <section className="bkl-hero" data-tone={hero.icon} aria-live="polite">
          <span className={`icon-circle icon-circle-${hero.icon}`}>
            <HeroIcon size={26} aria-hidden="true" />
          </span>
          <StatusBadge status={booking.status} />
          <h2>{hero.title}</h2>
          <p className="caption">{hero.caption}</p>
        </section>

        {movedFrom ? (
          <Callout tone="info" icon={<Info size={16} aria-hidden="true" />} className="bkl-callout">
            {t('bookings.movedFrom', {
              date: formatDayLabel(movedFrom.date),
              time: formatTime(movedFrom.time),
            })}
          </Callout>
        ) : null}

        {/* A salon that turned it down said why, and the customer was texted
            the same words. Showing them here means the text is a copy of the
            record rather than the only place it exists. */}
        {booking.status === 'rejected' && booking.rejectReason ? (
          <Callout tone="warning" icon={<Info size={16} aria-hidden="true" />} className="bkl-callout">
            <strong>{t('booking.rejectedReasonLabel')}:</strong> {booking.rejectReason}
          </Callout>
        ) : null}

        <Card className="stack-sm">
          <h3 className="bkl-section-title"><CalendarClock size={14} aria-hidden="true" /> {t('bookings.sectionWhen')}</h3>
          <div>
            <strong>{formatDateLong(start)}</strong>
            <p className="caption">{formatTimeRange(booking.time, booking.duration)} · {formatDuration(booking.duration)}</p>
          </div>
        </Card>

        <Card className="stack-sm">
          <h3 className="bkl-section-title"><MapPin size={14} aria-hidden="true" /> {t('bookings.sectionWhere')}</h3>
          <div>
            <Link to={ROUTES.professional(booking.professionalId)} className="strong">{booking.professionalName}</Link>
            {pro ? (
              <p className="bkl-address">
                {pro.location.address}
                <br />
                <span className="dim">{pro.location.area}, {pro.location.city}</span>
              </p>
            ) : null}
          </div>
          {/* Two buttons with two different sources, and only one of them is
              reliable.

              The number comes off the booking, which always carries it. It
              used to come from the directory cache, and that cache is only
              filled by opening a salon's own screens — so a booking made on
              another phone, or one opened after site data was cleared, had no
              number to ring. Ringing the salon is the thing a customer needs
              most when something has gone wrong with a booking, and it must
              not depend on which screens they happen to have visited.

              Directions still needs the cache, because an address is the one
              thing the booking payload does not carry. It is absent rather
              than broken when the cache is cold. */}
          <div className={pro ? 'grid-2' : undefined}>
            {pro ? (
              <ExternalButton href={directionsUrl(pro.location)} size="sm" icon={<Navigation size={16} aria-hidden="true" />}>
                {t('action.directions')}
              </ExternalButton>
            ) : null}
            <ExternalButton
              href={`tel:${booking.businessPhone}`}
              size="sm"
              newTab={false}
              icon={<Phone size={16} aria-hidden="true" />}
            >
              {t('action.call')}
            </ExternalButton>
          </div>
        </Card>

        <Card className="stack-sm">
          <h3 className="bkl-section-title"><Scissors size={14} aria-hidden="true" /> {t('bookings.sectionServices')}</h3>
          <ul className="stack-sm">
            {booking.services.map((service) => (
              <li key={service.id} className="bkl-service-row">
                <span>
                  {service.name}
                  <small>{formatDuration(service.duration)}</small>
                </span>
                <span className="price">{formatBdt(service.price)}</span>
              </li>
            ))}
          </ul>
          <p className="caption"><strong>{t('bookings.withStaff', { name: booking.staffName })}</strong></p>
        </Card>

        {booking.notes ? (
          <Card className="stack-sm">
            <h3 className="bkl-section-title"><FileText size={14} aria-hidden="true" /> {t('bookings.sectionNotes')}</h3>
            <p className="caption">{booking.notes}</p>
          </Card>
        ) : null}

        <Card className="stack-sm">
          <h3 className="bkl-section-title"><CreditCard size={14} aria-hidden="true" /> {t('bookings.sectionPayment')}</h3>
          <dl className="kv">
            <div className="kv-row"><dt>{t('bookings.subtotal')}</dt><dd>{formatBdt(booking.subtotal)}</dd></div>
            <div className="kv-row"><dt>{t('bookings.platformFee')}</dt><dd>{formatBdt(booking.platformFee)}</dd></div>
            <div className="kv-row kv-total"><dt>{t('bookings.total')}</dt><dd>{formatBdt(booking.total)}</dd></div>
            <div className="kv-row"><dt>{t('bookings.method')}</dt><dd>{t('booking.paymentAtSalon')}</dd></div>
          </dl>
          <div className="bkl-ref">
            <span className="mono">{t('bookings.ref', { id: booking.id })}</span>
            <IconButton label={t('bookings.copyRef')} onClick={copyRef}>
              <Copy size={18} />
            </IconButton>
          </div>
        </Card>

        <section className="stack-sm" aria-label={t('bookings.actionsLabel')}>
          {upcoming ? (
            <>
              <Button variant="secondary" block icon={<CalendarPlus size={18} aria-hidden="true" />} onClick={addToCalendar}>
                {t('bookings.addToCalendar')}
              </Button>
              <Button variant="secondary" block icon={<CalendarClock size={18} aria-hidden="true" />} onClick={() => reschedule(booking)}>
                {t('bookings.reschedule')}
              </Button>
              <Button variant="danger-soft" block icon={<XCircle size={18} aria-hidden="true" />} onClick={() => setSheet('cancel')}>
                {t('bookings.cancelBooking')}
              </Button>
            </>
          ) : booking.status === 'completed' ? (
            <>
              <Button block icon={<RotateCcw size={18} aria-hidden="true" />} onClick={() => rebook(booking)}>
                {t('bookings.rebook')}
              </Button>
              {review ? (
                <div className="between" style={{ justifyContent: 'center', minHeight: 'var(--control-height)' }}>
                  <Badge tone="success" plain pill>
                    <Star size={12} fill="currentColor" aria-hidden="true" />{' '}
                    {t('bookings.reviewedRating', { rating: formatNumber(review.rating) })}
                  </Badge>
                </div>
              ) : booking.can.review ? (
                <Button variant="accent-soft" block icon={<Star size={18} aria-hidden="true" />} onClick={() => setSheet('review')}>
                  {t('bookings.leaveReview')}
                </Button>
              ) : null}
              <Button variant="secondary" block icon={<Receipt size={18} aria-hidden="true" />} onClick={() => setSheet('receipt')}>
                {t('bookings.viewReceipt')}
              </Button>
            </>
          ) : (
            <Button block icon={<RotateCcw size={18} aria-hidden="true" />} onClick={() => rebook(booking)}>
              {t('bookings.rebook')}
            </Button>
          )}
          <div className="center">
            <button type="button" className="link-btn link-btn-muted" onClick={() => setSheet('policy')}>
              {t('bookings.cancellationPolicy')}
            </button>
          </div>
        </section>
      </ScreenBody>

      {sheet === 'cancel' ? <CancelDialog booking={booking} open onClose={() => setSheet(null)} /> : null}
      {sheet === 'review' ? <ReviewSheet booking={booking} open onClose={() => setSheet(null)} /> : null}
      {sheet === 'receipt' ? <ReceiptSheet booking={booking} open onClose={() => setSheet(null)} /> : null}
      <PolicySheet open={sheet === 'policy'} onClose={() => setSheet(null)} />
    </Screen>
  );
}
