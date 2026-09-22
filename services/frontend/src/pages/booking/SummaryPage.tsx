import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookingStepHeader } from '../../components/booking/BookingStepHeader';
import { PolicySheet } from '../../components/booking/PolicySheet';
import { useWizardStep } from '../../components/booking/useWizardStep';
import { ProfessionalNotFound, WizardLoading } from '../../components/booking/WizardShell';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { Checkbox } from '../../components/common/Checkbox';
import { Toggle } from '../../components/common/Toggle';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { DEFAULT_LOCATION, ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiValidationError } from '../../utils/apiClient';
import { messageOf } from '../../utils/errorMessage';
import { distanceKm } from '../../utils/geo';
import {
  formatBdt,
  formatDateLong,
  formatDayLabel,
  formatDistance,
  formatDuration,
  formatTime,
  formatTimeRange,
} from '../../utils/format';

/** Refusals that mean "this time is no longer yours to take".
 *
 *  Each sends the customer back to the calendar and lets go of the selection.
 *  Anything else — a dropped connection, a service that vanished — leaves the
 *  summary as it is, because re-picking a time would not help. */
const TIME_REFUSALS = new Set([
  'slot_taken', 'off_grid', 'outside_hours', 'closed', 'too_soon', 'nobody_available',
]);

export default function SummaryPage() {
  const { professionalId = '' } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const toast = useAppStore((s) => s.toast);
  const userLocation = useAppStore((s) => s.user?.location);
  const bookings = useAppStore((s) => s.bookings);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const { resolving,
    ready, exists, draft, professional, services, staffMember, subtotal, duration, platformFee, total,
    setAgreedPolicy, setSmsReminder, setDateTime, confirm, rescheduleOf,
  } = useWizardStep(professionalId, { hold: moving });

  if (resolving) return <WizardLoading title={t('booking.preparing')} />;
  if (!exists) return <ProfessionalNotFound />;
  if (!ready || !draft || !professional) return <WizardLoading title={t('booking.confirmStep')} />;
  if (!moving) {
    if (!rescheduleOf && !services.length) return <Navigate to={ROUTES.bookingService(professionalId)} replace />;
    if (!draft.date || !draft.time) return <Navigate to={ROUTES.bookingDateTime(professionalId)} replace />;
  }

  const original = rescheduleOf ? bookings.find((b) => b.id === rescheduleOf) : undefined;
  const lines = services.length ? services : original?.services ?? [];
  const totalMinutes = duration || original?.duration || 0;
  const date = draft.date ?? '';
  const time = draft.time ?? '';
  const km = distanceKm(userLocation ?? DEFAULT_LOCATION, professional.location);
  const stylistName = staffMember?.name ?? (rescheduleOf ? original?.staffName : undefined) ?? t('booking.anyone');

  const confirmMove = async () => {
    setMoving(true);
    try {
      const moved = await confirm();
      toast('success', t('booking.bookingMoved'), `${formatDayLabel(moved.date)} · ${formatTime(moved.time)}`);
      navigate(ROUTES.bookingDetail(moved.id), { replace: true });
    } catch (error) {
      setMoving(false);
      toast('error', t('booking.moveFailed'), error instanceof Error ? error.message : undefined);
    }
  };

  /** Books the slot. Nothing is charged — the salon takes payment at the chair
      — so this is the last step, and the confirmation is the next screen.

      When the time no longer stands, the honest answer is to send them back to
      the calendar rather than retry behind their back — and to let go of the
      time on the way. Keeping it meant they returned to a calendar with a dead
      time still selected, pressed Continue, and met the same refusal: the loop
      that made a slot look permanently unavailable.

      The server distinguishes its refusals now, so the message can too: only
      `slot_taken` is somebody else getting there first. */
  const book = async () => {
    setMoving(true);
    try {
      const booked = await confirm();
      navigate(ROUTES.bookingConfirmation(booked.id), { replace: true });
    } catch (error) {
      setMoving(false);
      const refusal = error instanceof ApiValidationError ? error.code : undefined;
      const gone = refusal !== undefined && TIME_REFUSALS.has(refusal);
      const taken = refusal === 'slot_taken';
      toast(
        'error',
        taken ? t('booking.slotTakenTitle') : t('booking.bookingFailed'),
        taken ? t('booking.slotTakenBody') : messageOf(error),
      );
      if (gone) {
        setDateTime(draft?.date, undefined);
        navigate(ROUTES.bookingDateTime(professionalId));
      }
    }
  };

  const editLink = (to: string, ariaLabel: string) => (
    <Link to={to} className="link-btn" aria-label={ariaLabel}>{t('action.edit')}</Link>
  );

  return (
    <Screen className="bk-step bk-step-confirm">
      {rescheduleOf ? (
        <BookingStepHeader title={t('booking.newTime')} />
      ) : (
        <BookingStepHeader title={professional.name} step={4} label={t('booking.confirmStep')} />
      )}
      <ScreenBody>
        <div className="bk-intro">
          <h2>{rescheduleOf ? t('booking.confirmNewTimeTitle') : t('booking.summaryTitle')}</h2>
          <p className="caption">{rescheduleOf ? t('booking.rescheduleSubtitle') : t('booking.summarySubtitle')}</p>
        </div>

        <div className="stack-sm stagger bk-sum">
          <Card>
            <div className="card-head">
              <h3 className="card-title">{t('booking.sectionProfessional')}</h3>
              {rescheduleOf ? null : editLink(ROUTES.professional(professionalId), t('booking.editProfessionalAria'))}
            </div>
            <p className="bk-sum-title">{professional.name}</p>
            <p className="caption">{professional.location.address}</p>
            <p className="small dim">
              {t('booking.areaDistance', { area: professional.location.area, distance: formatDistance(km) })}
            </p>
          </Card>

          <Card>
            <div className="card-head">
              <h3 className="card-title">{t('booking.services')}</h3>
              {rescheduleOf ? null : editLink(ROUTES.bookingService(professionalId), t('booking.editServicesAria'))}
            </div>
            <dl className="kv">
              {lines.map((service) => (
                <div key={service.id} className="kv-row">
                  <dt>{service.name}</dt>
                  <dd>{formatBdt(service.price)}</dd>
                </div>
              ))}
            </dl>
            <p className="small dim mt-2">{t('booking.totalTime', { duration: formatDuration(totalMinutes) })}</p>
          </Card>

          <Card>
            <div className="card-head">
              <h3 className="card-title">{t('booking.sectionDateTime')}</h3>
              {editLink(ROUTES.bookingDateTime(professionalId), t('booking.editDateTimeAria'))}
            </div>
            <p className="bk-sum-title">{formatDateLong(date)}</p>
            <p className="caption">{formatTimeRange(time, totalMinutes)}</p>
            {original ? (
              <p className="small dim mt-1">
                {t('booking.wasDateTime', {
                  date: formatDayLabel(original.date),
                  time: formatTime(original.time),
                })}
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="card-head">
              <h3 className="card-title">{t('booking.stylist')}</h3>
              {rescheduleOf ? null : editLink(ROUTES.bookingStaff(professionalId), t('booking.editStylistAria'))}
            </div>
            <p className="bk-sum-title">{stylistName}</p>
            {staffMember ? <p className="caption">{staffMember.title}</p> : null}
          </Card>

          <Card>
            <div className="card-head">
              <h3 className="card-title">{t('booking.sectionNotes')}</h3>
              {rescheduleOf ? null : editLink(ROUTES.bookingDateTime(professionalId), t('booking.editNotesAria'))}
            </div>
            <p className="caption">
              {draft.notes.trim() || (rescheduleOf ? original?.notes : undefined) || t('booking.noNotes')}
            </p>
          </Card>

          {rescheduleOf ? null : (
            <Card>
              <dl className="kv">
                <div className="kv-row"><dt>{t('booking.services')}</dt><dd>{formatBdt(subtotal)}</dd></div>
                <div className="kv-row"><dt>{t('booking.platformFee')}</dt><dd>{formatBdt(platformFee)}</dd></div>
                <div className="kv-row kv-total"><dt>{t('booking.priceTotal')}</dt><dd>{formatBdt(total)}</dd></div>
              </dl>
            </Card>
          )}
        </div>

        {!rescheduleOf && professional.acceptance === 'manual' ? (
          <Callout tone="warning" icon={<AlertTriangle size={18} aria-hidden="true" />}>
            {t('booking.manualApprovalWarning')}
          </Callout>
        ) : null}

        {rescheduleOf ? null : (
          <div className="bk-agree">
            <Checkbox checked={draft.agreedPolicy} onChange={setAgreedPolicy} label={t('booking.agreePolicy')} />
            <button type="button" className="link-btn" onClick={() => setPolicyOpen(true)}>
              {t('booking.viewPolicy')}
            </button>
          </div>
        )}
        <Toggle
          label={t('booking.smsReminder')}
          hint={t('booking.smsReminderHint')}
          checked={draft.smsReminder}
          onChange={setSmsReminder}
        />
      </ScreenBody>

      <StickyFooter
        meta={rescheduleOf ? undefined : <span>{t('booking.payAtSalonHint')}</span>}
      >
        {rescheduleOf ? (
          <Button block size="lg" loading={moving} onClick={confirmMove}>{t('booking.confirmNewTime')}</Button>
        ) : (
          <Button block size="lg" loading={moving} disabled={!draft.agreedPolicy} onClick={book}>
            {t('booking.confirmBooking', { amount: formatBdt(total) })}
          </Button>
        )}
      </StickyFooter>

      <PolicySheet open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </Screen>
  );
}
