import { useState } from 'react';
import { WEEKDAYS } from '../../../constants';
import { useT } from '../../../hooks/useLanguage';
import type { OperatingHours } from '../../../types';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Toggle } from '../../common/Toggle';
import { weekdayNames } from './labels';

interface HoursSheetProps {
  hours: OperatingHours;
  onClose: () => void;
  onSave: (hours: OperatingHours) => void;
}

/** The week as the shop actually opens it. A closed day keeps its times so
    turning it back on does not lose them. */
export function HoursSheet({ hours, onClose, onSave }: HoursSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState<OperatingHours>(hours);
  const names = weekdayNames();

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('pb.hoursEdit')}
      footer={<Button block onClick={() => onSave(draft)}>{t('action.save')}</Button>}
    >
      <div className="stack">
        {WEEKDAYS.map((day) => {
          const value = draft[day];
          return (
            <div className="pb-day" key={day}>
              <Toggle
                checked={!value.closed}
                onChange={(open) =>
                  setDraft((current) => ({ ...current, [day]: { ...current[day], closed: !open } }))
                }
                label={names[day]}
                hint={value.closed ? t('pb.hoursClosedAllDay') : undefined}
              />
              {!value.closed ? (
                <div className="grid-2">
                  <Input
                    label={t('pb.hoursOpensAt')}
                    type="time"
                    value={value.open}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [day]: { ...current[day], open: event.target.value },
                      }))
                    }
                  />
                  <Input
                    label={t('pb.hoursClosesAt')}
                    type="time"
                    value={value.close}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [day]: { ...current[day], close: event.target.value },
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}
