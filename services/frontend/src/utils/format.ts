import {
  addMinutes,
  differenceInCalendarDays,
  format as formatDate_,
  formatDistanceToNowStrict as formatDistanceToNowStrict_,
  isToday,
  isTomorrow,
  isYesterday,
  parse,
  parseISO,
} from 'date-fns';
import { translator } from '../i18n';
import { activeDateLocale, activeNumberLocale, getActiveLanguage } from './locale';

/** The dictionary for the language that is active right now. These helpers are
    plain functions, not components, so they read the language rather than
    receiving it. */
const t = () => translator(getActiveLanguage());

/* date-fns translates month and weekday names but always emits Western
   digits, so Bangla dates need the numerals mapped across too. */
const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';
const localizeDigits = (value: string): string =>
  getActiveLanguage() === 'bn' ? value.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]) : value;

/* Every date and number below renders in the active language: month and
   weekday names come from the date-fns locale, and Bangla shows Bengali
   numerals because that is what a Dhaka reader expects to see on a price. */
/** For display: translated words, and Bengali numerals in Bangla. */
const format = (date: Date | number, pattern: string): string =>
  localizeDigits(formatDate_(date, pattern, { locale: activeDateLocale() }));

/** Same, exposed for components that render dates themselves. */
export const formatPattern = (date: Date | number, pattern: string): string =>
  format(date, pattern);

/* Machine-readable values must never be localised: a key like "2026-09-08" is
   compared against stored data and parsed straight back, so Bengali numerals
   here would silently break every date lookup. */
const formatMachine = (date: Date | number, pattern: string): string =>
  formatDate_(date, pattern);

const formatDistanceToNowStrict = (date: Date): string =>
  localizeDigits(formatDistanceToNowStrict_(date, { locale: activeDateLocale() }));

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat(activeNumberLocale()).format(value);

/** 3182 -> "3.2k", and "৩.২ হা" in Bangla. */
export const formatCompact = (value: number): string =>
  new Intl.NumberFormat(activeNumberLocale(), {
    notation: 'compact',
    maximumFractionDigits: Math.abs(value) >= 10_000 ? 0 : 1,
  }).format(value);

export const formatBdt = (value: number): string => `৳${formatNumber(Math.round(value))}`;

export const formatRating = (rating: number): string =>
  new Intl.NumberFormat(activeNumberLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rating);

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return t()('unit.minutes', { count: formatNumber(minutes) });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest
    ? t()('unit.hoursMinutes', { hours: formatNumber(hours), minutes: formatNumber(rest) })
    : t()('unit.hours', { count: formatNumber(hours) });
};

/** Intl carries the unit name, so Bangla reads "৩.২ কিমি". */
export const formatDistance = (km: number): string =>
  km < 1
    ? new Intl.NumberFormat(activeNumberLocale(), {
        style: 'unit', unit: 'meter', maximumFractionDigits: 0,
      }).format(Math.round(km * 1000))
    : new Intl.NumberFormat(activeNumberLocale(), {
        style: 'unit', unit: 'kilometer', maximumFractionDigits: 1,
      }).format(km);

const toDate = (value: string | Date): Date => (typeof value === 'string' ? parseISO(value) : value);

/** "yyyy-MM-dd" + "HH:mm" -> Date in local time. */
export const combineDateTime = (date: string, time: string): Date =>
  parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date());

export const toDateKey = (date: Date): string => formatMachine(date, 'yyyy-MM-dd');

/** "10:00" -> "10:00 AM" */
export const formatTime = (time: string): string =>
  format(parse(time, 'HH:mm', new Date()), 'h:mm a');

/** "10:00", 30 -> "10:00 – 10:30 AM" */
export const formatTimeRange = (time: string, minutes: number): string => {
  const start = parse(time, 'HH:mm', new Date());
  const end = addMinutes(start, minutes);
  return `${format(start, 'h:mm')} – ${format(end, 'h:mm a')}`;
};

export const formatDate = (value: string | Date): string => format(toDate(value), 'd MMM yyyy');

export const formatDateLong = (value: string | Date): string => format(toDate(value), 'EEEE, d MMMM');

/** Booking cards: "Today", "Tomorrow", "Thu, 18 Sep". */
export const formatDayLabel = (dateKey: string): string => {
  const date = parse(dateKey, 'yyyy-MM-dd', new Date());
  if (isToday(date)) return t()('time.today');
  if (isTomorrow(date)) return t()('time.tomorrow');
  return format(date, 'EEE, d MMM');
};

export const formatMonthYear = (date: Date): string => format(date, 'MMMM yyyy');

export const formatRelative = (value: string | Date): string => {
  const date = toDate(value);
  const at = (day: string) => t()('time.dayAtTime', { day, time: format(date, 'h:mm a') });
  if (isToday(date)) return at(t()('time.today'));
  if (isYesterday(date)) return at(t()('time.yesterday'));
  if (Math.abs(differenceInCalendarDays(new Date(), date)) < 7) {
    return t()('time.ago', { duration: formatDistanceToNowStrict(date) });
  }
  return format(date, 'd MMM yyyy');
};

/** History groups: "Today", "Yesterday", "Earlier this week", "12 Aug 2026". */
export const formatDayGroup = (value: string | Date): string => {
  const date = toDate(value);
  if (isToday(date)) return t()('time.today');
  if (isYesterday(date)) return t()('time.yesterday');
  if (differenceInCalendarDays(new Date(), date) < 7) return t()('time.earlierThisWeek');
  return format(date, 'd MMM yyyy');
};

export const formatClock = (value: string | Date): string => format(toDate(value), 'h:mm a');

export const formatMemberSince = (value: string | Date): string => format(toDate(value), 'MMM yyyy');

/** Greeting for the home screen, from the device clock. */
export const greetingFor = (date: Date = new Date()): string => {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

/** "+8801712345678" -> "+880 1712-345678" */
export const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('880') ? digits.slice(3) : digits.replace(/^0/, '');
  if (local.length !== 10) return phone;
  return localizeDigits(`+880 ${local.slice(0, 4)}-${local.slice(4)}`);
};

/** "+8801712345678" -> "+880 17•• •••678" for the OTP screen and receipts. */
export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('880') ? digits.slice(3) : digits.replace(/^0/, '');
  if (local.length !== 10) return phone;
  return localizeDigits(`+880 ${local.slice(0, 2)}•• •••${local.slice(7)}`);
};

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

export const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]/g, ' ');

export const pluralize = (count: number, word: string, plural = `${word}s`): string =>
  `${count} ${count === 1 ? word : plural}`;
