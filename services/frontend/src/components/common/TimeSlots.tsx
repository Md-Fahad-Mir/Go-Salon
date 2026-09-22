import type { TimeSlot } from '../../types';
import { useT } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import { formatTime } from '../../utils/format';

interface TimeSlotsProps {
  slots: TimeSlot[];
  value?: string;
  onChange: (time: string) => void;
}

type Group = 'morning' | 'afternoon' | 'evening';

const GROUPS: Array<{ id: Group; key: TranslationKey }> = [
  { id: 'morning', key: 'time.morning' },
  { id: 'afternoon', key: 'time.afternoon' },
  { id: 'evening', key: 'time.evening' },
];

const groupOf = (time: string): Group => {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

/** Slot grid grouped by time of day. Booked slots stay visible but disabled
    so the day's shape is readable. */
export function TimeSlots({ slots, value, onChange }: TimeSlotsProps) {
  const t = useT();
  return (
    <div className="stack bk-slots">
      {GROUPS.map((group) => {
        const items = slots.filter((slot) => groupOf(slot.time) === group.id);
        if (!items.length) return null;
        const name = t(group.key);
        return (
          <div key={group.id} className="stack-sm bk-slot-group">
            <span className="label">{name}</span>
            <div className="slots" role="group" aria-label={t('slots.groupTimes', { group: name })}>
              {items.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  className="slot"
                  aria-pressed={value === slot.time}
                  disabled={!slot.available}
                  aria-label={
                    slot.available
                      ? formatTime(slot.time)
                      : t('slots.unavailable', { time: formatTime(slot.time) })
                  }
                  onClick={() => onChange(slot.time)}
                >
                  {formatTime(slot.time)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
