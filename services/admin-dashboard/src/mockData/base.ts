import type { OperatingHours, Weekday } from '../types';
import { WEEKDAYS } from '../constants';

/** Everything in the mock layer is generated from one seed so a reload shows
    the same dashboard twice — useful when comparing screenshots. */
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const rng = mulberry32(20260903);

export const randomInt = (min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min;

export const randomFloat = (min: number, max: number, digits = 1): number =>
  Number((rng() * (max - min) + min).toFixed(digits));

export const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng() * items.length)];

export const pickMany = <T,>(items: readonly T[], count: number): T[] => {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    result.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return result;
};

export const chance = (probability: number): boolean => rng() < probability;

/** Reference clock, captured once at module load. */
export const NOW = new Date();

export const isoDaysAgo = (days: number, hour = 10, minute = 0): string => {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const isoHoursAgo = (hours: number): string => {
  const date = new Date(NOW);
  date.setHours(date.getHours() - hours, randomInt(0, 59), 0, 0);
  return date.toISOString();
};

export const isoDaysAhead = (days: number, hour = 10, minute = 0): string =>
  isoDaysAgo(-days, hour, minute);

export const FIRST_NAMES = [
  'Tanvir', 'Nusrat', 'Rafiul', 'Sadia', 'Mehedi', 'Farhana', 'Imran', 'Tasnim',
  'Arif', 'Sabrina', 'Shakib', 'Rumana', 'Jubayer', 'Nadia', 'Fahim', 'Anika',
  'Rakib', 'Maliha', 'Sohel', 'Tania', 'Ashraful', 'Sharmin', 'Naimur', 'Israt',
  'Zahid', 'Lamia', 'Riyad', 'Priya', 'Mahmudul', 'Sumaiya', 'Tawhid', 'Nowrin',
] as const;

export const LAST_NAMES = [
  'Ahmed', 'Jahan', 'Islam', 'Rahman', 'Hasan', 'Akter', 'Hossain', 'Chowdhury',
  'Mahmud', 'Kabir', 'Begum', 'Alam', 'Sultana', 'Reza', 'Tabassum', 'Noor',
  'Rana', 'Haque', 'Karim', 'Das',
] as const;

export const fullName = (): string => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

export const phoneNumber = (): string =>
  `+8801${pick(['3', '5', '6', '7', '8', '9'])}${randomInt(10000000, 99999999)}`;

export const emailFor = (name: string): string =>
  `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@gmail.com`;

export const AREAS = [
  { area: 'Dhanmondi', lat: 23.7461, lng: 90.376 },
  { area: 'Gulshan', lat: 23.7925, lng: 90.4078 },
  { area: 'Uttara', lat: 23.8759, lng: 90.3795 },
  { area: 'Mirpur', lat: 23.8223, lng: 90.3654 },
  { area: 'Banani', lat: 23.7937, lng: 90.4066 },
  { area: 'Bashundhara', lat: 23.8203, lng: 90.4285 },
  { area: 'Mohammadpur', lat: 23.7593, lng: 90.3596 },
  { area: 'Old Dhaka', lat: 23.7104, lng: 90.4074 },
] as const;

export const makeLocation = () => {
  const spot = pick(AREAS);
  return {
    city: 'Dhaka',
    area: spot.area,
    address: `House ${randomInt(1, 99)}, Road ${randomInt(1, 27)}, ${spot.area}, Dhaka ${randomInt(1200, 1230)}`,
    lat: Number((spot.lat + randomFloat(-0.004, 0.004, 4)).toFixed(4)),
    lng: Number((spot.lng + randomFloat(-0.004, 0.004, 4)).toFixed(4)),
  };
};

export const makeHours = (openLate = false): OperatingHours => {
  const hours = {} as OperatingHours;
  for (const day of WEEKDAYS as Weekday[]) {
    const closed = day === 'friday' && chance(0.45);
    hours[day] = {
      open: closed ? '--:--' : pick(['09:00', '09:30', '10:00', '10:30']),
      close: closed ? '--:--' : openLate ? pick(['21:00', '22:00']) : pick(['19:00', '20:00', '20:30']),
      closed,
    };
  }
  return hours;
};
