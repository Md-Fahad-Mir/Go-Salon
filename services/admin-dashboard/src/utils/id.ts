let counter = 0;

/** Deterministic-enough ids for records created inside the demo session. */
export const nextId = (prefix: string): string => {
  counter += 1;
  return `${prefix}-${Date.now().toString(36).slice(-4)}${counter.toString(36)}`.toUpperCase();
};
