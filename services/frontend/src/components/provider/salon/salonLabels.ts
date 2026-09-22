/* Label keys and small derivations shared by the salon owner's screens.

   Kept out of the components so the react-refresh rule stays happy and so the
   same mapping is never written twice: a chair status must read identically on
   the floor, the roster and one stylist's page. */

import { APPOINTMENT_STAGE_TONES } from '../../../constants';
import type { TranslationKey } from '../../../i18n';
import { toDateKey } from '../../../utils/format';
import type {
  AppointmentStage,
  ProviderAppointment,
  StaffRecord,
  TakingsMethod,
  Weekday,
} from '../../../types';

export const STAGE_KEYS: Record<AppointmentStage, TranslationKey> = {
  pending: 'pro.stagePending',
  upcoming: 'pro.stageUpcoming',
  in_chair: 'pro.stageInChair',
  completed: 'pro.stageCompleted',
  no_show: 'pro.stageNoShow',
  cancelled: 'pro.stageCancelled',
};

export const TAKINGS_KEYS: Record<TakingsMethod, TranslationKey> = {
  cash: 'pro.takingsCash',
  bkash: 'pro.takingsBkash',
  nagad: 'pro.takingsNagad',
  rocket: 'pro.takingsRocket',
  card: 'pro.takingsCard',
};

export const WEEKDAY_SHORT_KEYS: Record<Weekday, TranslationKey> = {
  sun: 'salon.weekdaySun',
  mon: 'salon.weekdayMon',
  tue: 'salon.weekdayTue',
  wed: 'salon.weekdayWed',
  thu: 'salon.weekdayThu',
  fri: 'salon.weekdayFri',
  sat: 'salon.weekdaySat',
};

export const WEEKDAY_LONG_KEYS: Record<Weekday, TranslationKey> = {
  sun: 'salon.weekdaySunLong',
  mon: 'salon.weekdayMonLong',
  tue: 'salon.weekdayTueLong',
  wed: 'salon.weekdayWedLong',
  thu: 'salon.weekdayThuLong',
  fri: 'salon.weekdayFriLong',
  sat: 'salon.weekdaySatLong',
};

/** A finished appointment is anything the owner can no longer act on. */
export const isSettled = (stage: AppointmentStage): boolean =>
  stage === 'completed' || stage === 'no_show' || stage === 'cancelled';

/** The salon's revenue on one appointment: the services at its own prices.

    Deliberately not `total`, and deliberately without the tip. `total` carries
    the platform's booking fee, which is not the salon's money and is reported
    on its own; a tip is the stylist's in full and is never commissioned. This
    is the same basis the reports endpoint uses — `Sum(subtotal)` — so a stylist
    page and the analytics screen cannot drift apart. */
export const takeOf = (appointment: ProviderAppointment): number => appointment.subtotal;

/** The day money was taken on, which is the day it was completed — not the day
    it was booked for. A booking closed off the morning after belongs to the
    morning after, and that is how the server buckets it too. */
export const settledOn = (appointment: ProviderAppointment): string =>
  appointment.completedAt ? toDateKey(new Date(appointment.completedAt)) : appointment.date;

/** Money kept by one stylist on a set of finished appointments.

    Worked out at the rate on the employment *today* — nothing records what the
    rate was at the time — so every screen that prints this says so rather than
    letting it read as history. */
export const commissionOf = (revenue: number, member: Pick<StaffRecord, 'commissionRate'>): number =>
  Math.round((revenue * member.commissionRate) / 100);

/** Sorts by clock time, so a mixed list of chairs still reads as one day. */
export const byTime = (a: ProviderAppointment, b: ProviderAppointment): number =>
  a.time.localeCompare(b.time);

/** "10:00" as minutes past midnight, for comparing shift bounds. */
export const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** The pill class for one stage. `in_chair` gets the pulsing live treatment
    rather than the plain accent fill, because it is the only row that is
    changing while the owner looks at it. */
export const stagePillClass = (stage: AppointmentStage): string =>
  stage === 'in_chair' ? 'pro-pill pro-pill-live' : `pro-pill pro-pill-${APPOINTMENT_STAGE_TONES[stage]}`;

/** The amenities an owner can advertise. The stored value stays English so the
    customer-facing listing shows the same words; only the label is translated. */
export const AMENITY_OPTIONS: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'Air conditioned', labelKey: 'salon.amenityAirCon' },
  { value: 'Parking', labelKey: 'salon.amenityParking' },
  { value: 'Private bridal room', labelKey: 'salon.amenityBridalRoom' },
  { value: 'Card accepted', labelKey: 'salon.amenityCard' },
  { value: 'Refreshments', labelKey: 'salon.amenityRefreshments' },
  { value: 'Women only', labelKey: 'salon.amenityWomenOnly' },
  { value: 'Private booth', labelKey: 'salon.amenityPrivateBooth' },
];

/** The chairs cleared for one service, from the live roster.

    Eligibility is stored on the service as a list of employment ids, and this
    reads the roster rather than trusting that list wholesale — so a chair that
    has been removed stops being counted without any cleanup pass. */
export const chairsFor = (staffIds: string[], staff: StaffRecord[]): StaffRecord[] =>
  staff.filter((member) => staffIds.includes(member.id));
