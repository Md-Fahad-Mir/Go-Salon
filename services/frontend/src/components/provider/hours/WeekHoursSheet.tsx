import { CopyPlus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { WEEKDAYS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { Weekday } from '../../../types';
import type { WeekSchedule, WorkingDay } from '../../../types/schedule';
import { dayProblem, weekProblem, withDay } from '../../../utils/scheduleService';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { IconButton } from '../../common/IconButton';
import { Input } from '../../common/Input';
import { Toggle } from '../../common/Toggle';
import { WEEKDAY_LONG_KEYS } from '../salon/salonLabels';

interface WeekHoursSheetProps {
  open: boolean;
  onClose: () => void;
  week: WeekSchedule;
  onSave: (week: WeekSchedule) => void | Promise<void>;
  title?: string;
  saving?: boolean;
  /** Fired when one day is copied across the week, so the screen can say so. */
  onCopyAll?: () => void;
}

const DEFAULT_INTERVAL = { start: '10:00', end: '20:00' };
/** A second stretch normally starts after the break the first one ended for. */
const SECOND_INTERVAL = { start: '16:00', end: '20:00' };

/** Seven days of opening times, each of them possibly more than one stretch.
    A salon that shuts for lunch and a stylist who works a morning and an
    evening are the same shape, and neither fits a single open/close pair.

    A closed day collapses to one switch, and the first open day can be copied
    across the rest — which is how most Dhaka salons actually run. */
export function WeekHoursSheet({
  open,
  onClose,
  week,
  onSave,
  title,
  saving,
  onCopyAll,
}: WeekHoursSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState<WeekSchedule>(week);
  const [touched, setTouched] = useState(false);

  const set = (day: Weekday, patch: Partial<WorkingDay>) =>
    setDraft((current) => withDay(current, day, patch));

  const dayOf = (day: Weekday): WorkingDay =>
    draft.find((entry) => entry.day === day) ?? { day, closed: true, intervals: [] };

  const problemText = (day: Weekday): string | undefined => {
    if (!touched) return undefined;
    const problem = dayProblem(dayOf(day));
    if (problem === 'backwards') return t('hours.errBackwards');
    if (problem === 'overlap') return t('hours.errOverlap');
    if (problem === 'empty') return t('hours.errEmpty');
    return undefined;
  };

  const copyAll = () => {
    const source = draft.find((entry) => !entry.closed && entry.intervals.length);
    if (!source) return;
    setDraft((current) =>
      current.map((entry) =>
        entry.closed
          ? entry
          : { ...entry, intervals: source.intervals.map((interval) => ({ ...interval })) },
      ),
    );
    onCopyAll?.();
  };

  const submit = () => {
    if (weekProblem(draft)) {
      setTouched(true);
      return;
    }
    void onSave(draft);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title ?? t('hours.editTitle')}
      description={t('hours.editHint')}
      footer={
        <Button block loading={saving} onClick={submit}>
          {t('action.save')}
        </Button>
      }
    >
      <div className="stack">
        <Button
          variant="outline"
          size="sm"
          icon={<CopyPlus size={16} aria-hidden="true" />}
          onClick={copyAll}
        >
          {t('hours.copyAcrossWeek')}
        </Button>

        {WEEKDAYS.map((day) => {
          const entry = dayOf(day);
          const error = problemText(day);
          return (
            <div className="pb-day" key={day}>
              <Toggle
                checked={!entry.closed}
                onChange={(isOpen) =>
                  set(day, {
                    closed: !isOpen,
                    // Turning a day back on should not leave it with nothing;
                    // the server refuses an open day with no hours.
                    intervals: isOpen && entry.intervals.length === 0
                      ? [{ ...DEFAULT_INTERVAL }]
                      : entry.intervals,
                  })
                }
                label={t(WEEKDAY_LONG_KEYS[day])}
                hint={entry.closed ? t('hours.closedAllDay') : undefined}
              />

              {!entry.closed ? (
                <div className="stack-sm">
                  {entry.intervals.map((interval, index) => (
                    /* Intervals have no id and can repeat, so their position
                       is the only stable handle there is. */
                    <div className="hours-interval" key={index}>
                      <Input
                        label={index === 0 ? t('hours.opensAt') : t('hours.thenOpensAt')}
                        type="time"
                        value={interval.start}
                        onChange={(event) =>
                          set(day, {
                            intervals: entry.intervals.map((existing, i) =>
                              i === index ? { ...existing, start: event.target.value } : existing,
                            ),
                          })
                        }
                      />
                      <Input
                        label={t('hours.closesAt')}
                        type="time"
                        value={interval.end}
                        onChange={(event) =>
                          set(day, {
                            intervals: entry.intervals.map((existing, i) =>
                              i === index ? { ...existing, end: event.target.value } : existing,
                            ),
                          })
                        }
                      />
                      {entry.intervals.length > 1 ? (
                        <IconButton
                          label={t('hours.removeInterval')}
                          onClick={() =>
                            set(day, {
                              intervals: entry.intervals.filter((_, i) => i !== index),
                            })
                          }
                        >
                          <X size={18} />
                        </IconButton>
                      ) : null}
                    </div>
                  ))}

                  {error ? <p className="field-error">{error}</p> : null}

                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Plus size={14} aria-hidden="true" />}
                    onClick={() =>
                      set(day, { intervals: [...entry.intervals, { ...SECOND_INTERVAL }] })
                    }
                  >
                    {t('hours.addInterval')}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}
