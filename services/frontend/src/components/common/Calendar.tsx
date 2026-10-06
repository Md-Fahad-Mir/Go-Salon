import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useMemo, useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import { useUnavailableHint } from '../../hooks/useUnavailableHint';
import { formatPattern } from '../../utils/format';
import { IconButton } from './IconButton';

interface CalendarProps {
  /** "yyyy-MM-dd" */
  value?: string;
  onChange: (dateKey: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Extra rule, e.g. the salon is closed that weekday. */
  isDayDisabled?: (dateKey: string, date: Date) => boolean;
  /** Why `isDayDisabled` said no, in a sentence — shown when the day is
      hovered or tapped. Days before `minDate` and after `maxDate` explain
      themselves. */
  disabledReason?: (dateKey: string, date: Date) => string;
}

/* Column headings come from the active locale rather than a hardcoded list, so
   Bangla reads রবি সোম মঙ্গল … instead of Su Mo Tu. */
const useWeekdayNames = (): string[] =>
  useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(new Date()),
        end: endOfWeek(new Date()),
      }).map((day) => formatPattern(day, 'EEEEEE')),
    [],
  );

export function Calendar({ value, onChange, minDate, maxDate, isDayDisabled, disabledReason }: CalendarProps) {
  const t = useT();
  const weekdays = useWeekdayNames();
  const { hostRef, bind, node: hintNode } = useUnavailableHint();
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const [month, setMonth] = useState(() => startOfMonth(selected ?? minDate ?? new Date()));

  const min = minDate ? startOfDay(minDate) : undefined;
  const max = maxDate ? startOfDay(maxDate) : undefined;
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });

  const canPrev = !min || isAfter(startOfMonth(month), startOfMonth(min));
  const canNext = !max || isBefore(endOfMonth(month), max);

  /** Null when the day can be picked; otherwise what to tell someone who tries. */
  const whyNot = (key: string, day: Date): string | null => {
    if (min && isBefore(day, min)) return t('calendar.pastDay');
    if (max && isAfter(day, max)) return t('calendar.tooFar', { date: formatPattern(max, 'd MMMM') });
    if (isDayDisabled?.(key, day)) return disabledReason?.(key, day) ?? t('calendar.unavailable');
    return null;
  };

  return (
    <div className="calendar unavail-host" ref={hostRef}>
      <div className="calendar-head">
        <IconButton label={t('a11y.previousMonth')} onClick={() => setMonth(addMonths(month, -1))} disabled={!canPrev}>
          <ChevronLeft size={20} />
        </IconButton>
        <strong aria-live="polite">{formatPattern(month, 'MMMM yyyy')}</strong>
        <IconButton label={t('a11y.nextMonth')} onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext}>
          <ChevronRight size={20} />
        </IconButton>
      </div>
      <div className="calendar-grid" role="grid" aria-label={t('a11y.pickDate')}>
        {weekdays.map((day, index) => (
          <span key={index} className="calendar-dow" aria-hidden="true">{day}</span>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, month);
          // Days spilling in from the next month are hidden filler, not choices.
          const why = inMonth ? whyNot(key, day) : null;
          const picked = selected ? isSameDay(day, selected) : false;
          return (
            <button
              key={key}
              type="button"
              className="calendar-day"
              role="gridcell"
              aria-label={formatPattern(day, 'EEEE d MMMM')}
              aria-pressed={picked}
              data-today={isToday(day) ? 'true' : undefined}
              data-muted={inMonth ? undefined : 'true'}
              disabled={!inMonth}
              {...(why ? bind(key, why) : { onClick: () => onChange(key) })}
            >
              {formatPattern(day, 'd')}
            </button>
          );
        })}
      </div>
      {hintNode}
    </div>
  );
}
