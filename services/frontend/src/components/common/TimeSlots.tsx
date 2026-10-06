import type { TimeSlot } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { useUnavailableHint } from '../../hooks/useUnavailableHint';
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

/** The server's word for why a time is not on offer (`availability.py`),
    as something a customer can act on. */
const REASONS: Record<string, TranslationKey> = {
  taken: 'slots.whyTaken',
  too_soon: 'slots.whyTooSoon',
  outside_hours: 'slots.whyOutsideHours',
};

const groupOf = (time: string): Group => {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

/** Slot grid grouped by time of day. Booked slots stay visible but can't be
    picked, so the day's shape is readable — and hovering or tapping one says
    why it is gone. */
export function TimeSlots({ slots, value, onChange }: TimeSlotsProps) {
  const t = useT();
  const { hostRef, bind, node: hintNode } = useUnavailableHint();
  return (
    <div className="stack bk-slots unavail-host" ref={hostRef}>
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
                  aria-label={
                    slot.available
                      ? formatTime(slot.time)
                      : t('slots.unavailable', { time: formatTime(slot.time) })
                  }
                  {...(slot.available
                    ? { onClick: () => onChange(slot.time) }
                    : bind(slot.time, t(REASONS[slot.reason ?? ''] ?? 'slots.whyUnavailable')))}
                >
                  {formatTime(slot.time)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {hintNode}
    </div>
  );
}
