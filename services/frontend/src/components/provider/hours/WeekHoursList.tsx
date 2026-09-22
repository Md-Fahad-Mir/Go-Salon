import { useT } from '../../../hooks/useLanguage';
import { WEEKDAYS } from '../../../constants';
import type { WeekSchedule } from '../../../types/schedule';
import { formatTime } from '../../../utils/format';
import { WEEKDAY_LONG_KEYS } from '../salon/salonLabels';

/** The week, read-only. One line a day, however many stretches it has. */
export function WeekHoursList({ week }: { week: WeekSchedule }) {
  const t = useT();
  const byDay = new Map(week.map((entry) => [entry.day, entry]));

  return (
    <ul className="pb-hours">
      {WEEKDAYS.map((day) => {
        const entry = byDay.get(day);
        const closed = !entry || entry.closed || entry.intervals.length === 0;
        return (
          <li className="pb-hours-row" key={day}>
            <span>{t(WEEKDAY_LONG_KEYS[day])}</span>
            <span className={closed ? 'dim' : undefined}>
              {closed
                ? t('hours.closedAllDay')
                : entry.intervals
                    .map((interval) =>
                      t('booking.hoursRange', {
                        open: formatTime(interval.start),
                        close: formatTime(interval.end),
                      }),
                    )
                    .join(', ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
