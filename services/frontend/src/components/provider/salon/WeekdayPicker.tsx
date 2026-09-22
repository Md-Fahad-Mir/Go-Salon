import { WEEKDAYS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { Weekday } from '../../../types';
import { Chip, ChipRow } from '../../common/Chip';
import { WEEKDAY_LONG_KEYS, WEEKDAY_SHORT_KEYS } from './salonLabels';

interface WeekdayPickerProps {
  label: string;
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  error?: string;
}

/** The seven days as chips. Short labels keep the row on one line in Bangla;
    the long name goes on the button's accessible title. */
export function WeekdayPicker({ label, value, onChange, error }: WeekdayPickerProps) {
  const t = useT();
  const toggle = (day: Weekday) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : WEEKDAYS.filter((d) => d === day || value.includes(d)));

  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">{label}</legend>
      <ChipRow label={label}>
        {WEEKDAYS.map((day) => (
          <Chip key={day} small active={value.includes(day)} onClick={() => toggle(day)}>
            <span title={t(WEEKDAY_LONG_KEYS[day])}>{t(WEEKDAY_SHORT_KEYS[day])}</span>
          </Chip>
        ))}
      </ChipRow>
      {error ? (
        <p className="field-error" role="alert">{error}</p>
      ) : null}
    </fieldset>
  );
}
