import { CheckCircle2, MoreHorizontal, PhoneCall, Play, Shuffle, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment } from '../../../types';
import { formatBdt, formatDuration, formatNumber, formatTime } from '../../../utils/format';
import { ActionSheet, type SheetAction } from '../../common/ActionSheet';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { minutesInChair, minutesLate, minutesUntil, servicesLabel } from './queueUtils';

interface NowNextCardProps {
  /** Whoever is in the chair right now; otherwise the next one due. */
  appointment: ProviderAppointment;
  live: boolean;
  now: Date;
  onStart: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onReassign: () => void;
}

/** The one card a barber glances at between clients: who is in the chair, how
    long they have been there, and the two buttons that move the day along. */
export function NowNextCard({
  appointment, live, now, onStart, onComplete, onNoShow, onReassign,
}: NowNextCardProps) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);

  const elapsed = minutesInChair(appointment, now);
  const wait = minutesUntil(appointment, now);
  // A client who is already overdue needs telling, not a countdown to a time
  // that has been and gone.
  const late = live ? 0 : minutesLate(appointment, now);

  const actions: SheetAction[] = [
    { label: t('pro.markNoShow'), icon: <UserX size={18} aria-hidden="true" />, onSelect: onNoShow, danger: true },
    { label: t('proQueue.reassignAction'), icon: <Shuffle size={18} aria-hidden="true" />, onSelect: onReassign },
  ];
  if (appointment.customerPhone) {
    actions.splice(1, 0, {
      label: t('pro.callClient'),
      icon: <PhoneCall size={18} aria-hidden="true" />,
      onSelect: () => window.location.assign(`tel:${appointment.customerPhone}`),
    });
  }

  return (
    <section className="pq-hero" data-live={live ? 'true' : undefined}>
      <div className="pq-hero-head">
        <span className={live ? 'pro-pill pro-pill-live' : 'pro-pill pro-pill-info'}>
          {t(live ? 'pro.inChairNow' : 'pro.nextClient')}
        </span>
        <span className="pq-hero-clock" data-late={late > 0 ? 'true' : undefined} aria-live="polite">
          {live
            ? elapsed > 0
              ? t('proQueue.inChairFor', { duration: formatDuration(elapsed) })
              : t('proQueue.justStarted')
            : late > 0
              ? t('pro.minutesLate', { count: formatNumber(late) })
              : wait > 0
                ? t('pro.startsIn', { duration: formatDuration(wait) })
                : formatTime(appointment.time)}
        </span>
      </div>

      <Link to={ROUTES.proAppointment(appointment.id)} className="pq-hero-client">
        <span className="pq-hero-name">{appointment.customerName}</span>
        <span className="pq-hero-services">{servicesLabel(appointment)}</span>
        <span className="pq-hero-meta">
          <span className="pq-hero-price">{formatBdt(appointment.total)}</span>
          <span className="dim">{formatTime(appointment.time)} · {formatDuration(appointment.duration)}</span>
          {appointment.isNewCustomer ? <Badge tone="accent">{t('pro.newClient')}</Badge> : null}
          {appointment.walkIn ? <Badge tone="info">{t('pro.walkIn')}</Badge> : null}
        </span>
      </Link>

      <div className="pq-hero-actions">
        {live ? (
          <Button size="lg" icon={<CheckCircle2 size={20} aria-hidden="true" />} onClick={onComplete}>
            {t('pro.complete')}
          </Button>
        ) : (
          <Button size="lg" icon={<Play size={20} aria-hidden="true" />} onClick={onStart}>
            {t('pro.start')}
          </Button>
        )}
        <Button
          size="lg"
          variant="secondary"
          className="pq-hero-more"
          aria-label={t('proQueue.moreLabel')}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </Button>
      </div>

      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t('proQueue.moreTitle', { name: appointment.customerName })}
        actions={actions}
      />
    </section>
  );
}
