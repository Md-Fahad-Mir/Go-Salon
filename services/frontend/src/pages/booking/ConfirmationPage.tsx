import { addMinutes } from 'date-fns';
import { CalendarPlus, Check, Clock, MapPin, MessageSquareText, Scissors, Share2, UserRound, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookingNotFound } from '../../components/booking/WizardShell';
import { PolicySheet } from '../../components/booking/PolicySheet';
import { StatusBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { FooterRow, StickyFooter } from '../../components/layout/StickyFooter';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { getProfessional } from '../../store/useDirectoryStore';
import { useAppStore } from '../../store/useAppStore';
import {
  combineDateTime,
  formatBdt,
  formatDateLong,
  formatDuration,
  formatNumber,
  formatTimeRange,
  maskPhone,
} from '../../utils/format';
import { buildIcs, downloadText, shareOrCopy } from '../../utils/share';

export default function ConfirmationPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const booking = useAppStore((s) => s.bookings.find((b) => b.id === id));
  const phone = useAppStore((s) => s.user?.phone);
  const toast = useAppStore((s) => s.toast);
  const [policyOpen, setPolicyOpen] = useState(false);

  const goHome = () => navigate(ROUTES.home, { replace: true });
  if (!booking) return <BookingNotFound onHome={goHome} />;

  const pro = getProfessional(booking.professionalId);
  const confirmed = booking.status === 'approved';
  const serviceNames = booking.services.map((s) => s.name).join(', ');
  const address = pro?.location.address ?? '';

  const addToCalendar = () => {
    const start = combineDateTime(booking.date, booking.time);
    const ics = buildIcs({
      title: t('booking.icsTitle', { services: serviceNames, name: booking.professionalName }),
      description: t('booking.icsDescription', { id: booking.id, staff: booking.staffName }),
      location: address,
      start,
      end: addMinutes(start, booking.duration),
    });
    downloadText('eureka-booking.ics', ics);
    toast('success', t('booking.calendarSaved'), t('booking.calendarSavedBody'));
  };

  const share = async () => {
    const result = await shareOrCopy({
      title: t('booking.confShareTitle', { name: booking.professionalName }),
      text: t('booking.confShareText', {
        services: serviceNames,
        name: booking.professionalName,
        date: formatDateLong(booking.date),
        time: formatTimeRange(booking.time, booking.duration),
      }),
    });
    if (result === 'copied') toast('success', t('booking.copied'), t('booking.copiedBody'));
    else if (result === 'shared') toast('success', t('booking.shared'));
    else toast('error', t('booking.shareFailed'), t('booking.shareFailedBody'));
  };

  const steps = [
    booking.smsReminder ? t('booking.nextSms') : null,
    t('booking.nextArrive'),
    t('booking.nextShowRef'),
  ].filter((step): step is string => Boolean(step));

  return (
    <Screen className="bk-done">
      <Header close onBack={goHome} />
      <ScreenBody className="stagger">
        <div className="bk-hero" role="status">
          <span className="icon-circle icon-circle-lg icon-circle-success bk-pop">
            <Check size={36} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <h2>{confirmed ? t('booking.bookedTitle') : t('booking.requestSentTitle')}</h2>
          <p className="caption">
            {confirmed
              ? t('booking.bookedSubtitle')
              : t('booking.requestSentSubtitle', { name: booking.professionalName })}
          </p>
        </div>

        <Card className="bk-ticket">
          <div className="bk-ref">
            <StatusBadge status={booking.status} />
            <span className="mono dim">#{booking.id}</span>
          </div>
          <ul className="bk-services-list mt-3">
            {booking.services.map((service) => (
              <li key={service.id}>
                <span>{service.name}</span>
                <span>{formatBdt(service.price)}</span>
              </li>
            ))}
          </ul>
          <hr className="mt-3 mb-4 bk-ticket-perf" />
          <ul className="bk-detail-rows">
            <li>
              <MapPin size={18} aria-hidden="true" />
              <span><strong>{booking.professionalName}</strong>{address}</span>
            </li>
            <li>
              <Clock size={18} aria-hidden="true" />
              <span>
                <strong>{formatDateLong(booking.date)} · {formatTimeRange(booking.time, booking.duration)}</strong>
                {formatDuration(booking.duration)}
              </span>
            </li>
            <li>
              <UserRound size={18} aria-hidden="true" />
              <span><strong>{booking.staffName}</strong>{t('booking.yourStylist')}</span>
            </li>
            <li>
              <Wallet size={18} aria-hidden="true" />
              <span>
                <strong>{t('booking.payAtSalon', { amount: formatBdt(booking.total) })}</strong>
                {confirmed ? t('booking.receiptSms') : t('booking.awaitingNote')}
              </span>
            </li>
          </ul>
        </Card>

        {phone ? (
          <Callout tone="success" icon={<MessageSquareText size={18} aria-hidden="true" />}>
            {t('booking.confirmationSentTo', { phone: maskPhone(phone) })}
          </Callout>
        ) : null}

        <div className="section">
          <h3>{t('booking.whatsNext')}</h3>
          <ol className="checklist">
            {steps.map((step, index) => (
              <li key={step}>
                <span className="num" aria-hidden="true">{formatNumber(index + 1)}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="stack-sm bk-done-actions">
          <Button variant="secondary" block icon={<CalendarPlus size={18} aria-hidden="true" />} onClick={addToCalendar}>
            {t('booking.addToCalendar')}
          </Button>
          <Button variant="secondary" block icon={<Share2 size={18} aria-hidden="true" />} onClick={share}>
            {t('action.share')}
          </Button>
          <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setPolicyOpen(true)}>
            <Scissors size={16} aria-hidden="true" /> {t('booking.cancellationPolicy')}
          </button>
        </div>
      </ScreenBody>

      <StickyFooter>
        <FooterRow>
          <Button variant="outline" onClick={goHome}>{t('action.backToHome')}</Button>
          <Button onClick={() => navigate(ROUTES.bookings, { replace: true })}>{t('booking.viewBookings')}</Button>
        </FooterRow>
      </StickyFooter>

      <PolicySheet open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </Screen>
  );
}
