import { CalendarClock, ChevronRight, Clock, Navigation, Phone, Receipt, RotateCcw, Star, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Booking } from '../../types';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { getProfessional } from '../../store/useDirectoryStore';
import { formatDayLabel, formatNumber, formatTimeRange } from '../../utils/format';
import { directionsUrl } from '../../utils/geo';
import { Badge, StatusBadge } from '../common/Badge';
import { Button } from '../common/Button';
import { Callout } from '../common/Callout';
import { Card } from '../common/Card';
import { ExternalButton } from './ExternalButton';
import { cancelReasonLabel, isUpcoming, servicesLabel } from './bookingHelpers';

interface BookingCardProps {
  booking: Booking;
  onCancel: (booking: Booking) => void;
  onReschedule: (booking: Booking) => void;
  onRebook: (booking: Booking) => void;
  onReview: (booking: Booking) => void;
  onReceipt: (booking: Booking) => void;
}

export function BookingCard({ booking, onCancel, onReschedule, onRebook, onReview, onReceipt }: BookingCardProps) {
  const pro = getProfessional(booking.professionalId);
  const upcoming = isUpcoming(booking);
  const t = useT();
  const services = servicesLabel(booking);

  return (
    <Card className="bkl-card">
      <div className="between">
        <strong className="bkl-when">
          {formatDayLabel(booking.date)} · {formatTimeRange(booking.time, booking.duration)}
        </strong>
        <StatusBadge status={booking.status} />
      </div>

      <div>
        <p className="bkl-title">{services}</p>
        <p className="bkl-pro">
          <Link to={ROUTES.professional(booking.professionalId)}>{booking.professionalName}</Link>
          {' · '}
          {t('bookings.withStaff', { name: booking.staffName })}
        </p>
      </div>

      {booking.status === 'pending' ? (
        <Callout tone="warning" icon={<Clock size={16} aria-hidden="true" />} className="bkl-callout">
          {t('bookings.pendingCallout')}
        </Callout>
      ) : null}

      <hr className="bkl-divider" />

      <div className="bkl-actions">
        {upcoming ? (
          <>
            {pro ? (
              <ExternalButton href={directionsUrl(pro.location)} size="sm" icon={<Navigation size={16} aria-hidden="true" />}>
                {t('action.directions')}
              </ExternalButton>
            ) : null}
            {pro ? (
              <ExternalButton href={`tel:${pro.phone}`} size="sm" newTab={false} icon={<Phone size={16} aria-hidden="true" />}>
                {t('action.call')}
              </ExternalButton>
            ) : null}
            <Button size="sm" variant="secondary" icon={<CalendarClock size={16} aria-hidden="true" />} onClick={() => onReschedule(booking)}>
              {t('bookings.reschedule')}
            </Button>
            <Button size="sm" variant="danger-soft" icon={<XCircle size={16} aria-hidden="true" />} onClick={() => onCancel(booking)}>
              {t('action.cancel')}
            </Button>
          </>
        ) : booking.status === 'completed' ? (
          <>
            <Button size="sm" variant="secondary" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={() => onRebook(booking)}>
              {t('bookings.rebook')}
            </Button>
            <Button size="sm" variant="secondary" icon={<Receipt size={16} aria-hidden="true" />} onClick={() => onReceipt(booking)}>
              {t('bookings.receipt')}
            </Button>
            {/* The review and the right to write one both come off the row
                the server sent, so neither survives a refresh it should not.
                A visit that has been rated shows the score; one the server
                still says is open to review offers the button; anything else
                — somebody else's booking, a visit rated on another device —
                offers nothing. */}
            {booking.review ? (
              <Badge tone="success" plain>
                <Star size={12} fill="currentColor" aria-hidden="true" />
                {t('bookings.reviewedRating', { rating: formatNumber(booking.review.rating) })}
              </Badge>
            ) : booking.can.review ? (
              <Button size="sm" variant="accent-soft" icon={<Star size={16} aria-hidden="true" />} onClick={() => onReview(booking)}>
                {t('bookings.leaveReview')}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={() => onRebook(booking)}>
              {t('bookings.rebook')}
            </Button>
            <span className="bkl-cancel-note">
              {booking.cancelReason
                ? t('bookings.cancelledWithReason', { reason: cancelReasonLabel(booking.cancelReason, t) })
                : t('status.cancelled')}
            </span>
          </>
        )}
        <Link to={ROUTES.bookingDetail(booking.id)} className="link-btn bkl-details" aria-label={t('bookings.detailsOf', { services })}>
          {t('bookings.details')} <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
