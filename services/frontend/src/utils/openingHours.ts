/* Which days a customer can actually be seen.

   This has to agree with `Apps/bookings/availability.py`, because the calendar
   greys out days the customer never gets to ask about. The server's rule, in
   one sentence: **a chair with its own hours keeps them, and a chair without
   any keeps the salon's.** An override is not a narrowing of the salon's week
   — it replaces it — so a stylist who works ten to eight is bookable even at a
   salon that has never saved a week of its own.

   Getting this wrong is invisible in the good case and total in the bad one:
   the day is simply disabled, with nothing to say why. */

import { parse } from 'date-fns';
import type { Professional, StaffMember, Weekday, WeekSchedule } from '../types';
import { WEEKDAYS } from '../constants';

export const weekdayOf = (dateKey: string): Weekday =>
  WEEKDAYS[parse(dateKey, 'yyyy-MM-dd', new Date()).getDay()];

/** True when a week has this day open for at least one stretch. */
const opensOn = (week: WeekSchedule | undefined, day: Weekday): boolean => {
  const entry = week?.find((row) => row.day === day);
  return Boolean(entry && !entry.closed && entry.intervals.length > 0);
};

/** The week one chair works: its own if it has set any, otherwise the salon's.

    A chair whose week is entirely closed has still *set* one — "this chair
    never works" is a decision, not an absence — but the server has already
    resolved that, so what arrives here is the effective week either way. */
const weekOf = (pro: Professional, staff: StaffMember): WeekSchedule =>
  staff.hours && staff.hours.length ? staff.hours : pro.hours;

/** Can this business seat anyone on this day?

    With a named stylist the question is only about them. With "anyone" it is
    about the chairs: a salon is bookable on a day when *some* chair works it,
    which is exactly how the server builds its slot grid. A listing with no
    chairs is a barber working alone, and their own week is the answer.

    Fixture professionals predate per-chair hours and carry `daysOff` instead;
    they fall through to the salon's week minus those days. */
export function isOpenOn(
  pro: Professional,
  dateKey: string,
  staff?: StaffMember,
  roster: StaffMember[] = [],
): boolean {
  const day = weekdayOf(dateKey);
  const worksThen = (chair: StaffMember): boolean =>
    chair.hours && chair.hours.length
      ? opensOn(chair.hours, day)
      : opensOn(weekOf(pro, chair), day) && !chair.daysOff.includes(day);

  if (staff) return worksThen(staff);
  if (!roster.length) return opensOn(pro.hours, day);
  return roster.some(worksThen);
}
