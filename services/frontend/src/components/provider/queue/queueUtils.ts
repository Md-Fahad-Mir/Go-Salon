/* Shared vocabulary and arithmetic for the three "day's work" screens.

   The queue, one appointment and the diary all answer the same questions —
   whose appointments am I looking at, what stage is this one at, and what has
   the day taken — so the answers live here rather than three times over. */

import { differenceInMinutes } from 'date-fns';
import {
  APPOINTMENT_STAGE_TONES,
  TAKINGS_METHODS,
  type Tone,
} from '../../../constants';
import type { TranslationKey } from '../../../i18n';
import type {
  AppointmentStage,
  ProviderAppointment,
  ProviderProfile,
  StaffRecord,
  TakingsMethod,
} from '../../../types';
import { combineDateTime, toDateKey } from '../../../utils/format';

/* --- Labels ---------------------------------------------------------------- */

export const STAGE_KEYS: Record<AppointmentStage, TranslationKey> = {
  pending: 'pro.stagePending',
  upcoming: 'pro.stageUpcoming',
  in_chair: 'pro.stageInChair',
  completed: 'pro.stageCompleted',
  no_show: 'pro.stageNoShow',
  cancelled: 'pro.stageCancelled',
};

export const TAKINGS_KEYS: Record<TakingsMethod, TranslationKey> = TAKINGS_METHODS.reduce(
  (out, method) => ({ ...out, [method.id]: method.labelKey as TranslationKey }),
  {} as Record<TakingsMethod, TranslationKey>,
);

/** `.pro-pill` only carries five modifiers; every tone folds onto one of them. */
const PILL_BY_TONE: Record<Tone, string> = {
  accent: 'pro-pill-live',
  success: 'pro-pill-success',
  sage: 'pro-pill-success',
  warning: 'pro-pill-warning',
  coral: 'pro-pill-warning',
  danger: 'pro-pill-warning',
  info: 'pro-pill-info',
  neutral: 'pro-pill-neutral',
};

export const stagePillClass = (stage: AppointmentStage): string =>
  `pro-pill ${PILL_BY_TONE[APPOINTMENT_STAGE_TONES[stage]]}`;

export const servicesLabel = (appointment: ProviderAppointment): string =>
  appointment.services.map((service) => service.name).join(' · ');

/* --- Whose day is this? ---------------------------------------------------- */

/** An employee or a stylist sees only their own chair. A solo barber has no
    `staffId` on either side, so the same filter hands back everything. */
export const ownedBy = (
  appointments: ProviderAppointment[],
  profile: ProviderProfile | null,
): ProviderAppointment[] => {
  const chair = profile?.staffId;
  if (!chair) return appointments;
  return appointments.filter((a) => !a.staffId || a.staffId === chair);
};

export const onDay = (appointments: ProviderAppointment[], dateKey: string): ProviderAppointment[] =>
  appointments.filter((a) => a.date === dateKey).sort((a, b) => a.time.localeCompare(b.time));

export const todayKey = (): string => toDateKey(new Date());

/** Bookings that arrived over the socket this session and fall on a day the
    screen is not showing.

    A queue is scoped to one day, so a booking made for next Saturday would
    otherwise be announced once by a toast and then vanish. Anything already on
    the day in view is left out — it is on screen, and listing it twice would
    suggest two bookings. */
export const arrivalsOffView = (
  appointments: ProviderAppointment[],
  arrivals: string[],
  dayKey: string,
): ProviderAppointment[] =>
  appointments
    .filter((a) => arrivals.includes(a.id) && a.date !== dayKey && !isSettled(a.stage))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

/* --- Stage buckets --------------------------------------------------------- */

export const isSettled = (stage: AppointmentStage): boolean =>
  stage === 'completed' || stage === 'no_show' || stage === 'cancelled';

/** How many minutes past their slot an upcoming client already is, or 0. */
export const minutesLate = (appointment: ProviderAppointment, now: Date): number => {
  if (appointment.stage !== 'upcoming') return 0;
  const start = combineDateTime(appointment.date, appointment.time);
  const late = differenceInMinutes(now, start);
  return late > 0 ? late : 0;
};

/** Minutes until an upcoming client is due, or 0 once the slot has arrived. */
export const minutesUntil = (appointment: ProviderAppointment, now: Date): number => {
  const start = combineDateTime(appointment.date, appointment.time);
  const wait = differenceInMinutes(start, now);
  return wait > 0 ? wait : 0;
};

/** Minutes the client in the chair has been sitting there. */
export const minutesInChair = (appointment: ProviderAppointment, now: Date): number => {
  const from = appointment.startedAt
    ? new Date(appointment.startedAt)
    : combineDateTime(appointment.date, appointment.time);
  const elapsed = differenceInMinutes(now, from);
  return elapsed > 0 ? elapsed : 0;
};

/* --- Money ----------------------------------------------------------------- */

export interface DayTakings {
  /** Service totals of everything completed. */
  gross: number;
  tips: number;
  /** What actually went in the drawer. */
  total: number;
  completed: number;
}

export const takingsFor = (appointments: ProviderAppointment[]): DayTakings => {
  const done = appointments.filter((a) => a.stage === 'completed');
  const gross = done.reduce((sum, a) => sum + a.total, 0);
  const tips = done.reduce((sum, a) => sum + (a.tip ?? 0), 0);
  return { gross, tips, total: gross + tips, completed: done.length };
};

/** An employee keeps a share of each service plus the whole tip. The record is
    found through the profile's chair; with no record on file they keep it all. */
export const commissionRate = (profile: ProviderProfile | null, staff: StaffRecord[]): number => {
  const chair = profile?.staffId;
  if (!chair) return 100;
  const record = staff.find((member) => member.staffId === chair || member.id === chair);
  return record?.commissionRate ?? 100;
};

export const commissionEarned = (takings: DayTakings, rate: number): number =>
  Math.round((takings.gross * rate) / 100) + takings.tips;
