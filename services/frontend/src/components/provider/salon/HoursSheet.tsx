import { CopyPlus } from 'lucide-react';
import { useState } from 'react';
import { WEEKDAYS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { DayHours, OperatingHours, Weekday } from '../../../types';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { WEEKDAY_LONG_KEYS, minutesOf } from './salonLabels';

interface HoursSheetProps {
  open: boolean;
  onClose: () => void;
  hours: OperatingHours;
  onSave: (hours: OperatingHours) => void;
  /** Fired when the owner copies one day across the week, so the screen can
      say so out loud. */
  onCopyAll?: () => void;
}

/** Seven days of opening times without seven walls of inputs: a day that is
    closed collapses to a single switch, and the first open day can be copied
    across the rest, which is how most Dhaka salons actually run. */
export function HoursSheet({ open, onClose, hours, onSave, onCopyAll }: HoursSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState<OperatingHours>(hours);
  const [touched, setTouched] = useState(false);

  const set = (day: Weekday, patch: Partial<DayHours>) =>
    setDraft((current) => ({ ...current, [day]: { ...current[day], ...patch } }));

  const errorFor = (day: Weekday): string | undefined => {
    const entry = draft[day];
    if (entry.closed) return undefined;
    return minutesOf(entry.close) <= minutesOf(entry.open) ? t('salon.errHours') : undefined;
  };
  const valid = WEEKDAYS.every((day) => errorFor(day) === undefined);

  const copyAll = () => {
    const source = WEEKDAYS.map((day) => draft[day]).find((entry) => !entry.closed);
    if (!source) return;
    setDraft((current) => {
      const next = { ...current };
      for (const day of WEEKDAYS) {
        if (!next[day].closed) next[day] = { ...next[day], open: source.open, close: source.close };
      }
      return next;
    });
    onCopyAll?.();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.editHours')}
      footer={
        <Button
          block
          onClick={() => {
            if (!valid) {
              setTouched(true);
              return;
            }
            onSave(draft);
            onClose();
          }}
        >
          {t('action.save')}
        </Button>
      }
    >
      <div className="stack-sm">
        <Button
          variant="outline"
          size="sm"
          block
          icon={<CopyPlus size={16} aria-hidden="true" />}
          onClick={copyAll}
        >
          {t('salon.copyToAll')}
        </Button>

        <div className="ps-hours">
          {WEEKDAYS.map((day) => {
            const entry = draft[day];
            const error = touched ? errorFor(day) : undefined;
            return (
              <div key={day} className="ps-hour-day" data-closed={entry.closed ? 'true' : undefined}>
                <div className="ps-hour-head">
                  <span className="ps-hour-name">{t(WEEKDAY_LONG_KEYS[day])}</span>
                  <label className="ps-closed-toggle">
                    <span>{t('salon.closedLabel')}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={entry.closed}
                      aria-checked={entry.closed}
                      onChange={(event) => set(day, { closed: event.target.checked })}
                    />
                    <span className="switch-track" aria-hidden="true" />
                  </label>
                </div>

                {entry.closed ? null : (
                  <div className="ps-hour-times">
                    <Input
                      label={t('salon.opensAt')}
                      type="time"
                      value={entry.open}
                      onChange={(event) => set(day, { open: event.target.value })}
                    />
                    <Input
                      label={t('salon.closesAt')}
                      type="time"
                      value={entry.close}
                      onChange={(event) => set(day, { close: event.target.value })}
                      error={error}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
