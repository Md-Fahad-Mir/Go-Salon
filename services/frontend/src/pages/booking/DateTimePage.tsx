import { addDays, startOfToday } from 'date-fns';
import { AlertCircle, CalendarX2, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookingStepHeader } from '../../components/booking/BookingStepHeader';
import { useWizardStep } from '../../components/booking/useWizardStep';
import { ProfessionalNotFound, WizardLoading } from '../../components/booking/WizardShell';
import { Spinner } from '../../components/common/Spinner';
import { api } from '../../utils/api';
import type { Slot } from '../../utils/bookingService';

/** One answer from the availability endpoint, tagged with the query it was
    for — so an answer for yesterday's day can never be shown for today's. */
interface SlotResult {
  key: string;
  slots: Slot[];
  duration?: number;
  failed?: string;
}
import { messageOf } from '../../utils/errorMessage';
import { Button } from '../../components/common/Button';
import { Calendar } from '../../components/common/Calendar';
import { Callout } from '../../components/common/Callout';
import { Textarea } from '../../components/common/Input';
import { TimeSlots } from '../../components/common/TimeSlots';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { BOOKING_HORIZON_DAYS, ROUTES, SLOT_INTERVAL_MINUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { isOpenOn } from '../../utils/openingHours';
import { useAppStore } from '../../store/useAppStore';
import {
  firstNameOf,
  formatDateLong,
  formatDayLabel,
  formatDuration,
  formatNumber,
  formatTime,
  formatTimeRange,
} from '../../utils/format';

const NOTES_MAX = 300;

export default function DateTimePage() {
  const { professionalId = '' } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { resolving, ready, exists, draft, professional, services, staff, staffMember, duration, setDateTime, setNotes, rescheduleOf } =
    useWizardStep(professionalId);
  const bookings = useAppStore((s) => s.bookings);

  const original = rescheduleOf ? bookings.find((b) => b.id === rescheduleOf) : undefined;
  const date = draft?.date;
  const staffId = draft?.staffId ?? 'any';
  const serviceIds = draft?.serviceIds;
  const [attempt, setAttempt] = useState(0);

  /* Availability comes from the server: only it knows every chair's hours and
     what has already been sold. Times that are taken come back marked rather
     than missing, so the calendar can *say* four o'clock is gone.

     Kept as one keyed result, the way search and nearby do it: `loading` is
     "the answer for *this* query has not arrived", which is also what makes a
     stale answer for yesterday's day impossible to show. */
  const wanted = (serviceIds ?? []).join(',');
  const slotKey = [professionalId, date ?? '', wanted, staffId, rescheduleOf ?? '', attempt].join('|');
  const [result, setResult] = useState<SlotResult | null>(null);

  useEffect(() => {
    if (!date) return;
    let live = true;
    api.bookings
      .availability({
        listing: professionalId,
        date,
        serviceIds: wanted ? wanted.split(',') : undefined,
        employeeId: staffId,
        excludeId: rescheduleOf,
      })
      .then((availability) => {
        if (live) setResult({ key: slotKey, slots: availability.slots, duration: availability.durationMinutes });
      })
      .catch((error: unknown) => {
        if (live) setResult({ key: slotKey, slots: [], failed: messageOf(error) });
      });
    return () => {
      live = false;
    };
  }, [slotKey, date, professionalId, wanted, staffId, rescheduleOf]);

  const ready_ = result?.key === slotKey;
  const slots = ready_ ? result.slots : [];
  const slotFailure = ready_ ? result.failed : undefined;
  const loadingSlots = Boolean(date) && !ready_;
  const slotDuration = (ready_ ? result.duration : undefined)
    ?? duration
    ?? original?.duration
    ?? SLOT_INTERVAL_MINUTES;

  if (resolving) return <WizardLoading title={t('booking.preparing')} />;
  if (!exists) return <ProfessionalNotFound />;
  if (!ready || !draft || !professional) return <WizardLoading title={t('booking.when')} />;
  if (!rescheduleOf && !services.length) return <Navigate to={ROUTES.bookingService(professionalId)} replace />;

  const today = startOfToday();
  const hasSlot = slots.some((slot) => slot.available);
  const serviceNames = (services.length ? services : original?.services ?? []).map((s) => s.name).join(', ');
  /* The selection has to survive the *current* answer, not merely exist.
     Continue used to consult the draft alone, so a time that had since been
     taken — or that was never on offer — stayed pressable: the customer was
     bounced back here by the server's refusal, pressed the same time again,
     and got the same refusal. That loop is what "permanently unavailable"
     actually looked like.

     Only judged once the answer for this exact query has arrived; while it is
     in flight there is nothing to contradict the selection with. */
  const stillOffered = !ready_ || slots.some((slot) => slot.time === draft.time && slot.available);
  const canContinue = Boolean(draft.date && draft.time) && stillOffered;

  return (
    <Screen className="bk-step bk-step-when">
      {rescheduleOf ? (
        <BookingStepHeader title={t('booking.pickNewTime')} />
      ) : (
        <BookingStepHeader title={professional.name} step={3} label={t('booking.when')} />
      )}
      <ScreenBody>
        {rescheduleOf ? (
          <Callout tone="info" icon={<Info size={18} aria-hidden="true" />}>
            {t('booking.rescheduleInfo', {
              services: serviceNames || t('booking.appointment'),
              name: professional.name,
            })}
          </Callout>
        ) : null}
        <div className="bk-intro">
          <h2>{t('booking.whenTitle')}</h2>
          <p className="caption">
            {staffMember
              ? t('booking.showingStaffDays', { name: firstNameOf(staffMember.name) })
              : t('booking.closedDaysNote')}
          </p>
        </div>

        <Calendar
          value={draft.date}
          onChange={(day) => setDateTime(day, undefined)}
          minDate={today}
          maxDate={addDays(today, BOOKING_HORIZON_DAYS)}
          /* Whoever is being booked decides which days are open: a named
             stylist's own week, or — for "anyone" — any chair that works
             that day. Reading only the salon's week greyed out every day a
             stylist was free at a salon that had never saved one. */
          isDayDisabled={(key) => !isOpenOn(professional, key, staffMember, staff)}
        />

        <div className="section" aria-live="polite">
          {draft.date ? (
            <>
              <div className="bk-times-head">
                <h3>{t('booking.availableTimes')}</h3>
                <span className="caption">{formatDateLong(draft.date)}</span>
              </div>
              {loadingSlots ? (
                <div className="bk-loading" aria-busy="true">
                  <Spinner label={t('booking.findingTimes')} />
                </div>
              ) : slotFailure ? (
                <Callout tone="danger" icon={<AlertCircle size={18} aria-hidden="true" />}>
                  {slotFailure}
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                      {t('action.retry')}
                    </Button>
                  </div>
                </Callout>
              ) : hasSlot ? (
                <>
                  <TimeSlots slots={slots} value={draft.time} onChange={(time) => setDateTime(draft.date, time)} />
                  {/* Said out loud rather than left as a greyed-out button. */}
                  {draft.time && !stillOffered ? (
                    <Callout tone="warning" icon={<AlertCircle size={18} aria-hidden="true" />}>
                      {t('booking.timeGone', { time: formatTime(draft.time) })}
                    </Callout>
                  ) : null}
                </>
              ) : (
                <Callout tone="warning" icon={<CalendarX2 size={18} aria-hidden="true" />}>
                  {t('booking.fullyBooked')}
                </Callout>
              )}
            </>
          ) : (
            <p className="caption center">{t('booking.pickDayHint')}</p>
          )}
        </div>

        <Textarea
          label={t('booking.notesLabel')}
          optional
          placeholder={t('booking.notesPlaceholder')}
          value={draft.notes}
          maxLength={NOTES_MAX}
          hint={`${formatNumber(draft.notes.length)}/${formatNumber(NOTES_MAX)}`}
          onChange={(event) => setNotes(event.target.value)}
        />
      </ScreenBody>
      <StickyFooter
        meta={
          <>
            <span aria-live="polite">
              {draft.date && draft.time
                ? `${formatDayLabel(draft.date)} · ${formatTimeRange(draft.time, slotDuration)}`
                : t('booking.pickDayTime')}
            </span>
            <span>{slotDuration ? formatDuration(slotDuration) : ''}</span>
          </>
        }
      >
        <Button block size="lg" disabled={!canContinue} onClick={() => navigate(ROUTES.bookingSummary(professionalId))}>
          {t('action.continue')}
        </Button>
      </StickyFooter>
    </Screen>
  );
}
