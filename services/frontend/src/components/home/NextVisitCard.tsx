import { CalendarCheck, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Booking } from '../../types';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { formatDayLabel, formatTime } from '../../utils/format';
import { StatusBadge } from '../common/Badge';

/** Compact "your next visit" row on the home screen. */
export function NextVisitCard({ booking }: { booking: Booking }) {
  const t = useT();
  const services = booking.services.map((s) => s.name).join(', ');
  return (
    <Link
      to={ROUTES.bookingDetail(booking.id)}
      className="card home-visit"
      aria-label={t('home.visitAria', {
        services,
        pro: booking.professionalName,
        day: formatDayLabel(booking.date),
        time: formatTime(booking.time),
      })}
    >
      <span className="icon-circle home-visit-icon" aria-hidden="true">
        <CalendarCheck size={22} />
      </span>
      <span className="home-visit-body">
        <span className="home-visit-when">
          {formatDayLabel(booking.date)} · {formatTime(booking.time)}
        </span>
        <span className="home-visit-title truncate">{services}</span>
        <span className="home-visit-where truncate">
          {booking.professionalName} · {booking.staffName}
        </span>
        <span className="home-visit-status">
          <StatusBadge status={booking.status} />
        </span>
      </span>
      <ChevronRight size={20} className="home-visit-chevron" aria-hidden="true" />
    </Link>
  );
}
