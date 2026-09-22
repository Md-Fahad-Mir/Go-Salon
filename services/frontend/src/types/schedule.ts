/* ==========================================================================
   Working hours.

   A week is seven days, each shut or open for one or more stretches. The
   second stretch is the point: a salon that closes for lunch, or a stylist
   who works a morning and an evening, cannot be described by one open/close
   pair — which is all `OperatingHours` on the customer side can hold.
   ========================================================================== */

import type { Weekday } from './index';

/** "09:00"–"13:00". `end` is exclusive and always later than `start`. */
export interface WorkInterval {
  start: string;
  end: string;
}

export interface WorkingDay {
  day: Weekday;
  closed: boolean;
  intervals: WorkInterval[];
}

/** Always seven entries, Sunday first. */
export type WeekSchedule = WorkingDay[];

/** Where the hours on screen came from.

    `salon` matters: an employee looking at inherited hours has to be told
    they are the salon's, or "edit" would silently start an override they
    never asked for. `default` is a suggested week nobody has saved yet. */
export type ScheduleSource = 'own' | 'salon' | 'default';

export interface Schedule {
  source: ScheduleSource;
  days: WeekSchedule;
}
