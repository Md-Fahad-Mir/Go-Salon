/** Reference clock, captured once at module load. Dates in the mock layer are
    relative to it so the demo never goes stale. */
export const NOW = new Date();

export const isoDaysAgo = (days: number, hour = 10, minute = 0): string => {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const isoHoursAgo = (hours: number, minute = 0): string => {
  const date = new Date(NOW);
  date.setHours(date.getHours() - hours, minute, 0, 0);
  return date.toISOString();
};

export const isoDaysAhead = (days: number, hour = 10, minute = 0): string =>
  isoDaysAgo(-days, hour, minute);

/** "yyyy-MM-dd" for a day offset from today, in local time. */
export const dateKeyFromToday = (offsetDays: number): string => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
