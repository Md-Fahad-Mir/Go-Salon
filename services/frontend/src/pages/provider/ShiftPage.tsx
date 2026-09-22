import { CalendarOff, Clock, Info, MapPin, Navigation, Phone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/common/Button';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Calendar } from '../../components/common/Calendar';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Textarea } from '../../components/common/Input';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import {
  minutesNow,
  minutesOf,
  weekdayLabel,
  weekdayOf,
} from '../../components/provider/team/teamHelpers';
import { WeekHoursSheet } from '../../components/provider/hours/WeekHoursSheet';
import { WEEKDAYS } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { WorkingDay } from '../../types';
import { messageOf } from '../../utils/errorMessage';
import { formatDateLong, formatDuration, formatPhone, formatTime } from '../../utils/format';
import { directionsUrl } from '../../utils/geo';

/** The stretch of a day that is running, or the next one still to come — what
    "two hours left" is measured against when a day has more than one. */
function currentSpan(day: WorkingDay | undefined, nowMinutes: number) {
  if (!day || day.closed || day.intervals.length === 0) return null;
  const spans = day.intervals
    .map((interval) => ({ start: minutesOf(interval.start), end: minutesOf(interval.end) }))
    .sort((a, b) => a.start - b.start);
  return spans.find((span) => nowMinutes < span.end) ?? spans[spans.length - 1];
}

/* The employee's shift screen. The one thing they open the app for mid-shift
   is the chair toggle, so it sits above everything else; the week, the salon
   and time-off requests follow underneath. */

export default function ShiftPage() {
  const t = useT();
  const profile = useProviderStore((state) => state.profile);
  const schedule = useProviderStore((state) => state.schedule);
  const saveSchedule = useProviderStore((state) => state.saveSchedule);
  const toast = useAppStore((state) => state.toast);

  const [hoursOpen, setHoursOpen] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [timeOffOpen, setTimeOffOpen] = useState(false);

  const now = new Date();
  const today = weekdayOf(now);

  if (!profile || !schedule) {
    return (
      <Screen nav>
        <Header title={t('pt.shiftTitle')} />
        <ScreenBody>
          <EmptyState
            className="pt-empty"
            icon={<Clock size={26} aria-hidden="true" />}
            title={t('pt.offToday')}
            description={t('pt.offTodayHint')}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const week = schedule.days;
  const day = week.find((entry) => entry.day === today);
  const isOff = !day || day.closed || day.intervals.length === 0;
  const nowMinutes = minutesNow(now);
  const span = currentSpan(day, nowMinutes);
  const salonName = profile.salonName ?? profile.businessName;

  const remaining = (() => {
    if (isOff || !span) return { tone: 'neutral', text: t('pt.offToday') };
    if (nowMinutes < span.start) {
      return { tone: 'info', text: t('pt.shiftStartsIn', { duration: formatDuration(span.start - nowMinutes) }) };
    }
    if (nowMinutes >= span.end) return { tone: 'neutral', text: t('pt.shiftOver') };
    return { tone: 'live', text: t('pt.hoursLeft', { duration: formatDuration(span.end - nowMinutes) }) };
  })();

  const dayLabel = (entry: WorkingDay | undefined): string =>
    !entry || entry.closed || entry.intervals.length === 0
      ? t('pt.dayOff')
      : entry.intervals
          .map((interval) =>
            t('booking.hoursRange', {
              open: formatTime(interval.start),
              close: formatTime(interval.end),
            }),
          )
          .join(', ');

  const saveHours = async (days: typeof week) => {
    setSavingHours(true);
    try {
      await saveSchedule(days);
      setHoursOpen(false);
      toast('success', t('hours.saved'));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSavingHours(false);
    }
  };

  return (
    <Screen nav>
      <Header title={t('pt.shiftTitle')} />
      <ScreenBody>
        {/* --- Today, and where I am right now --- */}
        <Card className="pt-today">
          <div className="between">
            <div className="stack-xs">
              <span className="label">{t('pt.todaysShift')}</span>
              <strong className="title">{dayLabel(day)}</strong>
              <span className="caption">{formatDateLong(now)}</span>
            </div>
            <span className={`pro-pill pro-pill-${remaining.tone}`} aria-live="polite">
              {remaining.text}
            </span>
          </div>

        </Card>

        {/* --- The week the salon has set --- */}
        <section className="section" aria-labelledby="pt-week-head">
          <div className="pt-head">
            <h3 id="pt-week-head">{t('pt.thisWeek')}</h3>
            <p>{t('hours.fromSalonBody', { salon: salonName })}</p>
          </div>
          <ul className="pt-week">
            {WEEKDAYS.map((weekday) => {
              const entry = week.find((row) => row.day === weekday);
              const closed = !entry || entry.closed || entry.intervals.length === 0;
              const isToday = weekday === today;
              return (
                <li key={weekday}>
                  <div
                    className="pt-week-row"
                    data-today={isToday ? 'true' : undefined}
                    aria-current={isToday ? 'date' : undefined}
                  >
                    <span className="pt-week-day">{weekdayLabel(weekday)}</span>
                    <span className="pt-week-time">
                      {closed ? (
                        <span className="pro-pill pro-pill-neutral">{t('pt.dayOff')}</span>
                      ) : (
                        dayLabel(entry)
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* --- The salon, read-only --- */}
        <section className="section" aria-labelledby="pt-salon-head">
          <h3 className="label" id="pt-salon-head">{t('pt.whereIWork')}</h3>
          <Card className="pt-salon">
            <div className="stack-xs">
              <strong className="subtitle">{salonName}</strong>
              {profile.location.address ? (
                <span className="caption row-xs">
                  <MapPin size={14} aria-hidden="true" />
                  {profile.location.address}
                </span>
              ) : null}
              {profile.phone ? <span className="caption">{formatPhone(profile.phone)}</span> : null}
            </div>
            <div className="row-sm mt-3">
              <a
                className="btn btn-outline btn-sm grow"
                href={directionsUrl(profile.location)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={16} aria-hidden="true" />
                {t('action.directions')}
              </a>
              <a className="btn btn-secondary btn-sm grow" href={`tel:${profile.phone}`}>
                <Phone size={16} aria-hidden="true" />
                {t('action.call')}
              </a>
            </div>
            <p className="caption mt-2">{t('pt.salonManagesThis')}</p>
          </Card>
        </section>

        {/* --- Time off --- */}
        <section className="section" aria-labelledby="pt-timeoff-head">
          <h3 className="label" id="pt-timeoff-head">{t('pt.timeOff')}</h3>
          <Card className="pt-timeoff">
            <p className="caption">{t('pt.timeOffHint')}</p>
            <Button
              className="mt-3"
              block
              variant="outline"
              icon={<CalendarOff size={18} aria-hidden="true" />}
              onClick={() => setTimeOffOpen(true)}
            >
              {t('pt.requestDayOff')}
            </Button>
          </Card>
        </section>
      </ScreenBody>

      {hoursOpen ? (
        <WeekHoursSheet
          open
          week={week}
          saving={savingHours}
          title={t('hours.editTitle')}
          onClose={() => setHoursOpen(false)}
          onSave={saveHours}
          onCopyAll={() => toast('info', t('hours.copiedToast'))}
        />
      ) : null}

      <BottomSheet open={timeOffOpen} onClose={() => setTimeOffOpen(false)} title={t('pt.requestDayOff')}>
        {timeOffOpen ? (
          <TimeOffForm
            onSubmit={(dateKey) => {
              setTimeOffOpen(false);
              toast('success', t('pt.dayOffSent'), t('pt.dayOffSentBody', { date: formatDateLong(dateKey) }));
            }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

/* --- The day-off request ---------------------------------------------------- */

function TimeOffForm({ onSubmit }: { onSubmit: (dateKey: string) => void }) {
  const t = useT();
  const [dateKey, setDateKey] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ date?: string; reason?: string }>({});

  const submit = () => {
    const next: { date?: string; reason?: string } = {};
    if (!dateKey) next.date = t('pt.errPickDay');
    if (reason.trim().length < 3) next.reason = t('pt.errReason');
    setErrors(next);
    if (next.date || next.reason) return;
    onSubmit(dateKey);
  };

  return (
    <div className="stack">
      <div className="stack-xs">
        <span className="label">{t('pt.whichDay')}</span>
        <Calendar
          value={dateKey || undefined}
          onChange={(value) => {
            setErrors((current) => ({ ...current, date: undefined }));
            setDateKey(value);
          }}
          minDate={new Date()}
        />
        {errors.date ? (
          <p className="field-error" role="alert">{errors.date}</p>
        ) : dateKey ? (
          <p className="field-hint">{formatDateLong(dateKey)}</p>
        ) : null}
      </div>
      <Textarea
        label={t('pt.reason')}
        rows={3}
        value={reason}
        placeholder={t('pt.reasonPlaceholder')}
        error={errors.reason}
        onChange={(event) => {
          setErrors((current) => ({ ...current, reason: undefined }));
          setReason(event.target.value);
        }}
      />
      <Callout tone="info" icon={<Info size={18} aria-hidden="true" />}>
        {t('pt.requestNote')}
      </Callout>
      <Button block onClick={submit}>{t('pt.sendRequest')}</Button>
    </div>
  );
}
