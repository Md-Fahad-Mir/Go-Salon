/* Working hours.

   A week goes over the wire whole. Sending one day at a time would make
   "closed on Friday" and "open 9-1 and 4-8 on Friday" two different kinds of
   request; one shape means one validation pass and no half-written weeks. */

import { WEEKDAYS } from '../constants';
import type { Weekday } from '../types';
import type { Schedule, ScheduleSource, WeekSchedule, WorkingDay } from '../types/schedule';
import { api } from './apiClient';

interface ApiInterval {
  start: string;
  end: string;
}

interface ApiDay {
  day: Weekday;
  is_closed: boolean;
  intervals: ApiInterval[];
}

interface ApiSchedule {
  source: ScheduleSource;
  editable: boolean;
  days: ApiDay[];
}

const toDay = (row: ApiDay): WorkingDay => ({
  day: row.day,
  closed: row.is_closed,
  intervals: row.intervals.map((interval) => ({ ...interval })),
});

export const toSchedule = (payload: ApiSchedule): Schedule => ({
  source: payload.source,
  days: payload.days.map(toDay),
});

const fromDay = (day: WorkingDay): ApiDay => ({
  day: day.day,
  is_closed: day.closed,
  // A closed day carries no hours — the server refuses a row that claims both.
  intervals: day.closed ? [] : day.intervals.map((interval) => ({ ...interval })),
});

export const scheduleService = {
  async mine(): Promise<Schedule> {
    return toSchedule(await api.get<ApiSchedule>('/schedule/me/'));
  },

  async saveMine(days: WeekSchedule): Promise<Schedule> {
    return toSchedule(await api.put<ApiSchedule>('/schedule/me/', { days: days.map(fromDay) }));
  },

  /** An employee handing their hours back to the salon's. */
  async clearMine(): Promise<Schedule> {
    return toSchedule(await api.delete<ApiSchedule>('/schedule/me/'));
  },

  async forEmployee(employmentId: string): Promise<Schedule> {
    return toSchedule(await api.get<ApiSchedule>(`/schedule/employees/${employmentId}/`));
  },

  async saveForEmployee(employmentId: string, days: WeekSchedule): Promise<Schedule> {
    return toSchedule(
      await api.put<ApiSchedule>(`/schedule/employees/${employmentId}/`, {
        days: days.map(fromDay),
      }),
    );
  },

  async clearForEmployee(employmentId: string): Promise<Schedule> {
    return toSchedule(await api.delete<ApiSchedule>(`/schedule/employees/${employmentId}/`));
  },
};

/* --- Working with a week in the UI ---------------------------------------- */

/** A blank week, for a form that has nothing to start from. */
export const emptyWeek = (): WeekSchedule =>
  WEEKDAYS.map((day) => ({ day, closed: true, intervals: [] }));

/** Replaces one day, leaving the rest of the week as it was. */
export const withDay = (week: WeekSchedule, day: Weekday, patch: Partial<WorkingDay>): WeekSchedule =>
  week.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry));

const minutes = (value: string): number => {
  const [hours, mins] = value.split(':').map(Number);
  return (hours || 0) * 60 + (mins || 0);
};

/** The reason this file exists: two stretches covering the same minute means
    two bookings for one chair. Checked here so the form can say so before the
    server does, and checked there again because that is the boundary. */
export function dayProblem(day: WorkingDay): 'backwards' | 'overlap' | 'empty' | null {
  if (day.closed) return null;
  if (day.intervals.length === 0) return 'empty';
  const ordered = [...day.intervals].sort((a, b) => minutes(a.start) - minutes(b.start));
  for (const interval of ordered) {
    if (minutes(interval.end) <= minutes(interval.start)) return 'backwards';
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (minutes(ordered[index].start) < minutes(ordered[index - 1].end)) return 'overlap';
  }
  return null;
}

export const weekProblem = (week: WeekSchedule): boolean =>
  week.some((day) => dayProblem(day) !== null);

/** Minutes a week is open — what the summary line on the hours screen shows. */
export const weeklyMinutes = (week: WeekSchedule): number =>
  week.reduce(
    (total, day) =>
      day.closed
        ? total
        : total + day.intervals.reduce((sum, i) => sum + Math.max(0, minutes(i.end) - minutes(i.start)), 0),
    0,
  );
