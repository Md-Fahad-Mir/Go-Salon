import { addMinutes, format, isSameDay, parse } from 'date-fns';
import type { Professional, TimeSlot, Weekday, WorkingDay } from '../types';
import { SLOT_INTERVAL_MINUTES, WEEKDAYS } from '../constants';
import { hashUnit } from '../utils/id';
// Whether a day is bookable is a real rule the server also applies, so it
// lives with the other real logic rather than here among the fixtures.
import { weekdayOf } from '../utils/openingHours';

export { weekdayOf };

/* Turning a business's week into bookable times.

   A day is one or more stretches, not a single open/close pair, because a
   salon that shuts for lunch is a real thing — so every function here walks
   the stretches rather than assuming there is one. */

/** The stretches a business works on one weekday. Empty means shut. */
export const hoursOn = (pro: Professional, day: Weekday): WorkingDay['intervals'] => {
  const entry = pro.hours.find((row) => row.day === day);
  return entry && !entry.closed ? entry.intervals : [];
};

/** Is the shop open right now?

    The server answers this for a listing — against the business's own
    timezone — so its answer is preferred; this is the fallback for a record
    that predates the field. */
export const isOpenNow = (pro: Professional, now: Date = new Date()): boolean => {
  if (typeof pro.openNow === 'boolean') return pro.openNow;
  const current = format(now, 'HH:mm');
  return hoursOn(pro, WEEKDAYS[now.getDay()]).some(
    (stretch) => current >= stretch.start && current < stretch.end,
  );
};

/** Today's stretches, for the "open until" line on a profile. */
export const todaysHours = (pro: Professional, now: Date = new Date()) =>
  hoursOn(pro, WEEKDAYS[now.getDay()]);

/** Deterministic availability: the same salon/staff/date/time always answers
    the same way, so a refresh does not reshuffle the calendar.

    Availability itself has no backend yet — there is nowhere to record that a
    chair is taken — so `busy` is a stable hash rather than a real diary. The
    *hours* it works within are real. */
export const getSlots = (
  pro: Professional,
  staffId: string,
  dateKey: string,
  durationMinutes: number,
  taken: string[] = [],
  now: Date = new Date(),
): TimeSlot[] => {
  const stretches = hoursOn(pro, weekdayOf(dateKey));
  if (stretches.length === 0) return [];

  const date = parse(dateKey, 'yyyy-MM-dd', new Date());
  const isToday = isSameDay(date, now);
  const slots: TimeSlot[] = [];

  for (const stretch of stretches) {
    const open = parse(`${dateKey} ${stretch.start}`, 'yyyy-MM-dd HH:mm', new Date());
    const close = parse(`${dateKey} ${stretch.end}`, 'yyyy-MM-dd HH:mm', new Date());
    let cursor = open;
    // A cut has to finish before the shutters come down, so the last slot of
    // a stretch is one that fits inside it.
    while (addMinutes(cursor, durationMinutes) <= close) {
      const time = format(cursor, 'HH:mm');
      const pastCutoff = isToday && cursor <= addMinutes(now, 45);
      const busy = hashUnit(`${pro.id}:${staffId}:${dateKey}:${time}`) < 0.32;
      slots.push({ time, available: !pastCutoff && !busy && !taken.includes(time) });
      cursor = addMinutes(cursor, SLOT_INTERVAL_MINUTES);
    }
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time));
};

/** A quick "next opening" for cards: first available slot today or later. */
export const nextAvailable = (
  pro: Professional,
  durationMinutes = 30,
  now: Date = new Date(),
): { dateKey: string; time: string; label: string } | null => {
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const dateKey = format(date, 'yyyy-MM-dd');
    const open = getSlots(pro, 'any', dateKey, durationMinutes, [], now).find((s) => s.available);
    if (open) {
      const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : format(date, 'EEE');
      return { dateKey, time: open.time, label };
    }
  }
  return null;
};
