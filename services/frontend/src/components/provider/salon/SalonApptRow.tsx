import { MoreVertical, Scissors, UserPlus } from 'lucide-react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment } from '../../../types';
import { formatDuration, formatTime } from '../../../utils/format';
import { Badge } from '../../common/Badge';
import { IconButton } from '../../common/IconButton';
import { Price } from '../../common/Price';
import { STAGE_KEYS, TAKINGS_KEYS, stagePillClass } from './salonLabels';

interface SalonApptRowProps {
  appointment: ProviderAppointment;
  /** Omitted on screens that only report a chair's day. */
  onMenu?: (id: string) => void;
  /** The stylist line is the point of the owner's feed; hide it only on a
      screen that is already about one person. */
  showStylist?: boolean;
}

/** One booking on the salon floor. Unlike a stylist's own queue this always
    names the chair it belongs to, because that is the decision the owner is
    making: is this person in the right seat? */
export function SalonApptRow({ appointment, onMenu, showStylist = true }: SalonApptRowProps) {
  const t = useT();
  const live = appointment.stage === 'in_chair';
  const done = appointment.stage === 'completed' || appointment.stage === 'no_show' || appointment.stage === 'cancelled';

  return (
    <div className="pro-appt" data-live={live ? 'true' : undefined} data-done={done ? 'true' : undefined}>
      <div className="pro-appt-time">
        <strong>{formatTime(appointment.time)}</strong>
        <small>{formatDuration(appointment.duration)}</small>
      </div>

      <div className="pro-appt-body">
        <span className="pro-appt-name">{appointment.customerName}</span>
        <span className="pro-appt-services">{appointment.services.map((service) => service.name).join(' · ')}</span>

        {showStylist ? (
          <span className="ps-stylist" data-none={appointment.staffName ? undefined : 'true'}>
            {appointment.staffName ? <Scissors size={13} aria-hidden="true" /> : <UserPlus size={13} aria-hidden="true" />}
            <span>{appointment.staffName ? t('salon.withStylist', { name: appointment.staffName }) : t('salon.unassigned')}</span>
          </span>
        ) : null}

        <div className="pro-appt-meta">
          <Price value={appointment.total} />
          {appointment.isNewCustomer ? <Badge tone="accent">{t('pro.newClient')}</Badge> : null}
          {appointment.walkIn ? <Badge tone="sage">{t('pro.walkIn')}</Badge> : null}
          {/* Only ever the method the app actually knows, and never "cash" as a
              guess. It does not print "not recorded" either, because on this
              row absence is ambiguous: `AppointmentSerializer` does not return
              `paid_with`, so on any device but the one that settled up, blank
              means "the server did not say" rather than "nobody recorded it".
              Saying "not recorded" here would tell an owner watching the salon
              queue that a booking the counter rang up as bKash has nothing on
              file. The reports may say it, because the server can see the
              column; this row may not. It becomes sayable the day that field
              is serialised.

              The stage guard is load-bearing: `keepLocal` now carries a
              payment across a refresh, so a booking cancelled server-side
              after it was settled would otherwise keep printing how it was
              paid. */}
          {appointment.stage === 'completed' && appointment.paidWith ? (
            <span>{t(TAKINGS_KEYS[appointment.paidWith])}</span>
          ) : null}
        </div>
      </div>

      <div className="ps-appt-end">
        <span className={stagePillClass(appointment.stage)}>{t(STAGE_KEYS[appointment.stage])}</span>
        {onMenu ? (
          <IconButton
            label={t('salon.rowActions', { name: appointment.customerName })}
            onClick={() => onMenu(appointment.id)}
          >
            <MoreVertical size={20} />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
