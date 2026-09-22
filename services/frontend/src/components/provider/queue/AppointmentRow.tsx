import { Link } from 'react-router-dom';
import { ROUTES } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment } from '../../../types';
import { formatBdt, formatDuration, formatNumber, formatTime } from '../../../utils/format';
import { Badge } from '../../common/Badge';
import { StagePill } from './StagePill';
import { isSettled, minutesLate, servicesLabel } from './queueUtils';

interface AppointmentRowProps {
  appointment: ProviderAppointment;
  /** The ticking clock, so a row can go late while the screen sits open. */
  now: Date;
  /** Diary rows for a finished day carry no live or late treatment. */
  readOnly?: boolean;
}

/** One line of the day. Tapping it opens the appointment in full. */
export function AppointmentRow({ appointment, now, readOnly }: AppointmentRowProps) {
  const t = useT();
  const live = appointment.stage === 'in_chair';
  const done = isSettled(appointment.stage);
  const late = readOnly ? 0 : minutesLate(appointment, now);

  return (
    <Link
      to={ROUTES.proAppointment(appointment.id)}
      className="pro-appt"
      data-live={live ? 'true' : undefined}
      data-done={done ? 'true' : undefined}
      aria-label={t('proQueue.openAppointment', { name: appointment.customerName })}
    >
      <span className="pro-appt-time">
        <strong>{formatTime(appointment.time)}</strong>
        <small>{formatDuration(appointment.duration)}</small>
      </span>

      <span className="pro-appt-body">
        <span className="pro-appt-name">{appointment.customerName}</span>
        <span className="pro-appt-services">{servicesLabel(appointment)}</span>
        <span className="pro-appt-meta">
          {appointment.isNewCustomer ? <Badge tone="accent">{t('pro.newClient')}</Badge> : null}
          {appointment.walkIn ? <Badge tone="info">{t('pro.walkIn')}</Badge> : null}
          {live || done ? <StagePill stage={appointment.stage} /> : null}
          {late > 0 ? (
            <span className="pro-pill pro-pill-warning">{t('pro.minutesLate', { count: formatNumber(late) })}</span>
          ) : null}
        </span>
      </span>

      <span className="pq-appt-end">{formatBdt(appointment.total)}</span>
    </Link>
  );
}
