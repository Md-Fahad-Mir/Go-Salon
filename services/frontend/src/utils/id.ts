let counter = 0;

/** Short, unique-enough ids for records created on the device. */
export const nextId = (prefix: string): string => {
  counter += 1;
  const time = Date.now().toString(36).slice(-6).toUpperCase();
  const rand = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `${prefix}-${time}${rand}${counter.toString(36).toUpperCase()}`;
};

/** Booking references look like the ones on the receipt: BOOK20260918003. */
export const bookingRef = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `BOOK${y}${m}${d}${seq}`;
};

/** Deterministic 0–1 value from a string; used to make "random" mock data
    (booked slots, review picks) stable across reloads. */
export const hashUnit = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
};
