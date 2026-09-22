import { eachDayOfInterval, endOfWeek, isBefore, parse, startOfDay, startOfWeek } from 'date-fns';
import { CalendarX2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppointmentRow } from '../../components/provider/queue/AppointmentRow';
import { onDay, ownedBy, todayKey } from '../../components/provider/queue/queueUtils';
import { settledOn, takeOf } from '../../components/provider/salon/salonLabels';
import { useTicker } from '../../components/provider/queue/useTicker';
import { Calendar } from '../../components/common/Calendar';
import { Segmented } from '../../components/common/Tabs';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import { useProviderProfile } from '../../hooks/useRole';
import { useProviderStore } from '../../store/useProviderStore';
import {
  formatBdt,
  formatDateLong,
  formatNumber,
  formatPattern,
  toDateKey,
} from '../../utils/format';

type View = 'day' | 'week';

/* The shared <Calendar> has no marker slot, and it owns its own month state, so
   the dots are painted onto its cells by matching each cell's aria-label — the
   same label this page can build for every day it has work on. A observer
   re-paints them when the barber pages to another month. */
function useBookedDots(labels: Set<string>) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const paint = () => {
      for (const cell of host.querySelectorAll<HTMLButtonElement>('.calendar-day')) {
        const booked = labels.has(cell.getAttribute('aria-label') ?? '');
        if (booked) cell.dataset.booked = 'true';
        else delete cell.dataset.booked;
      }
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [labels]);

  return ref;
}

export default function CalendarPage() {
  const t = useT();
  const profile = useProviderProfile();
  const appointments = useProviderStore((s) => s.appointments);
  const now = useTicker(60_000);

  const [view, setView] = useState<View>('day');
  const [selected, setSelected] = useState(todayKey);

  const mine = useMemo(() => ownedBy(appointments, profile), [appointments, profile]);

  /** Every day that has something on it, keyed the way <Calendar> labels cells. */
  const bookedLabels = useMemo(() => {
    const out = new Set<string>();
    for (const appointment of mine) {
      if (appointment.stage === 'cancelled') continue;
      out.add(formatPattern(parse(appointment.date, 'yyyy-MM-dd', new Date()), 'EEEE d MMMM'));
    }
    return out;
  }, [mine]);
  const calendarRef = useBookedDots(bookedLabels);

  const selectedDate = parse(selected, 'yyyy-MM-dd', new Date());
  const dayList = onDay(mine, selected).filter((a) => a.stage !== 'cancelled');
  /* What was taken on the day being looked at, on the same basis the reports
     use: the services at the shop's own prices. Not the customer's bill — that
     carries Eureka's booking fee, which is not the shop's money — and not the
     tips, which are the stylist's in full and belong to no takings figure.

     Counted over the whole diary rather than over the rows listed underneath,
     because the list is the day that was *booked* and this is the day the
     money came in. Those are routinely different days here, and summing the
     visible rows would credit a payment to the day of the appointment instead
     of the day of the payment — the same mistake the reports endpoint exists
     to stop, so the diary and the analytics screen agree on what a day took. */
  const dayTakings = mine.reduce(
    (sum, appointment) =>
      appointment.stage === 'completed' && settledOn(appointment) === selected
        ? sum + takeOf(appointment)
        : sum,
    0,
  );
  const past = isBefore(startOfDay(selectedDate), startOfDay(now));

  const week = eachDayOfInterval({ start: startOfWeek(selectedDate), end: endOfWeek(selectedDate) }).map((date) => {
    const key = toDateKey(date);
    return {
      key,
      date,
      count: mine.filter((a) => a.date === key && a.stage !== 'cancelled').length,
    };
  });
  const peak = Math.max(1, ...week.map((day) => day.count));

  return (
    <Screen nav>
      <Header title={t('proQueue.diaryTitle')} />

      <ScreenBody className="pb-screen pb-diary">
        <Segmented
          label={t('proQueue.viewSwitch')}
          active={view}
          onChange={setView}
          tabs={[
            { id: 'day', label: t('proQueue.viewDay') },
            { id: 'week', label: t('proQueue.viewWeek') },
          ]}
        />

        {view === 'day' ? (
          <div className="pq-cal" ref={calendarRef}>
            <Calendar value={selected} onChange={setSelected} />
            <p className="pq-cal-key">
              <span className="pq-cal-dot" aria-hidden="true" /> {t('proQueue.hasAppointments')}
            </p>
          </div>
        ) : (
          <section className="card card-pad stack-sm" aria-label={t('proQueue.weekHead')}>
            <div className="pro-section-head">
              <h3>{t('proQueue.weekHead')}</h3>
              <span>{formatPattern(week[0].date, 'd MMM')} – {formatPattern(week[6].date, 'd MMM')}</span>
            </div>
            <div className="pro-chart">
              {week.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  className="pro-chart-col"
                  data-peak={day.count === peak && day.count > 0 ? 'true' : undefined}
                  aria-pressed={day.key === selected}
                  aria-label={t('proQueue.weekColumn', {
                    day: formatPattern(day.date, 'EEEE d MMMM'),
                    count: formatNumber(day.count),
                  })}
                  onClick={() => setSelected(day.key)}
                >
                  <span className="pq-chart-count" aria-hidden="true">{formatNumber(day.count)}</span>
                  <span
                    className="pro-chart-bar"
                    style={{ height: `${Math.round((day.count / peak) * 100)}%` }}
                    aria-hidden="true"
                  />
                  <small aria-hidden="true">{formatPattern(day.date, 'EEEEE')}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="section" aria-label={t('proQueue.pickDay')}>
          <div className="pro-section-head">
            <h3>{formatDateLong(selectedDate)}</h3>
            <span>{t('pro.appointments', { count: formatNumber(dayList.length) })}</span>
          </div>

          {dayList.length ? (
            <>
              <div className="pq-day-total">
                <span className="caption">{t('proQueue.dayTakings')}</span>
                <strong>{formatBdt(dayTakings)}</strong>
              </div>
              <div className="stack-sm">
                {dayList.map((appointment) => (
                  <AppointmentRow key={appointment.id} appointment={appointment} now={now} readOnly={past} />
                ))}
              </div>
              {past ? <p className="small dim">{t('proQueue.pastDayNote')}</p> : null}
            </>
          ) : (
            <div className="pro-empty-day">
              <CalendarX2 size={26} aria-hidden="true" />
              <strong>{t('proQueue.emptyDayTitle')}</strong>
              <p>{t('proQueue.emptyDayBody')}</p>
            </div>
          )}
        </section>
      </ScreenBody>
    </Screen>
  );
}
