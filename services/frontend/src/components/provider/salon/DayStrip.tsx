import { addDays } from 'date-fns';
import { useT } from '../../../hooks/useLanguage';
import { formatDayLabel, formatPattern, toDateKey } from '../../../utils/format';

interface DayStripProps {
  /** Day offsets from today, e.g. -3 … +3. */
  offsets: number[];
  value: number;
  onChange: (offset: number) => void;
}

/** Three days back, three forward. Enough to check yesterday's takings or
    tomorrow's bridal booking without opening a calendar. */
export function DayStrip({ offsets, value, onChange }: DayStripProps) {
  const t = useT();
  const today = new Date();

  return (
    <div className="ps-days" role="group" aria-label={t('salon.dayStrip')}>
      {offsets.map((offset) => {
        const date = addDays(today, offset);
        return (
          <button
            key={offset}
            type="button"
            className="ps-day"
            aria-pressed={offset === value}
            aria-label={formatDayLabel(toDateKey(date))}
            onClick={() => onChange(offset)}
          >
            <small>{formatPattern(date, 'EEE')}</small>
            <strong>{formatPattern(date, 'd')}</strong>
          </button>
        );
      })}
    </div>
  );
}
