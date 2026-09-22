import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns';

const numberFmt = new Intl.NumberFormat('en-US');

export const formatNumber = (value: number): string => numberFmt.format(value);

/** Compact form used on KPI tiles and chart axes: 842000 -> "842k". */
export const formatCompact = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(value);
};

export const formatBdt = (value: number): string => `৳${numberFmt.format(Math.round(value))}`;

export const formatBdtCompact = (value: number): string => `৳${formatCompact(value)}`;

/** Small AI costs need cents; headline spend does not. */
export const formatUsd = (value: number): string =>
  Math.abs(value) < 100 ? `$${value.toFixed(2)}` : `$${numberFmt.format(Math.round(value))}`;

export const formatPercent = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

const toDate = (value: string | Date): Date =>
  typeof value === 'string' ? parseISO(value) : value;

/** Matches the header clock: "3 Sep 2026 · 11:04". */
export const formatDateTime = (value: string | Date): string =>
  format(toDate(value), "d MMM yyyy · HH:mm");

export const formatDate = (value: string | Date): string => format(toDate(value), 'd MMM yyyy');

export const formatShortDate = (value: string | Date): string => format(toDate(value), 'd MMM');

export const formatTime = (value: string | Date): string => format(toDate(value), 'HH:mm');

export const formatRelative = (value: string | Date): string => {
  const date = toDate(value);
  if (isToday(date)) return `Today · ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Yesterday · ${format(date, 'HH:mm')}`;
  return `${formatDistanceToNowStrict(date)} ago`;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

export const formatSeconds = (seconds: number): string => `${seconds.toFixed(1)}s`;

/** "Textured crop" -> "TC", used for avatar fallbacks. */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

export const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

export const formatPhone = (phone: string): string => phone;

/** Ratings always carry one decimal so a column of them stays aligned. */
export const formatRating = (rating: number): string => rating.toFixed(1);
