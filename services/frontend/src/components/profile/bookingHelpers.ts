import type { Booking } from '../../types';
import type { TFunction, TKey } from '../../i18n';
import { combineDateTime } from '../../utils/format';

export type BookingTab = 'upcoming' | 'completed' | 'cancelled';

/** Still holding a chair: waiting on the salon, or agreed. */
export const isUpcoming = (booking: Booking): boolean =>
  booking.status === 'pending' || booking.status === 'approved';

export const bookingStart = (booking: Booking): Date => combineDateTime(booking.date, booking.time);

export const servicesLabel = (booking: Booking): string => booking.services.map((s) => s.name).join(', ');

/** Hours from now until the appointment; negative once it has started. */
export const hoursUntil = (booking: Booking, now: Date = new Date()): number =>
  (bookingStart(booking).getTime() - now.getTime()) / 3.6e6;

/** Too late to call it off online.

    The window is the business's own — a salon can widen it — so this reads
    the booking rather than a constant. The server decides in the end; this is
    only what the screen offers. */
export const isInsideCancelWindow = (booking: Booking, now: Date = new Date()): boolean =>
  hoursUntil(booking, now) < booking.cancellationWindowHours;

export const tabFor = (booking: Booking): BookingTab =>
  isUpcoming(booking)
    ? 'upcoming'
    : booking.status === 'completed'
      ? 'completed'
      // Turned down, called off or moved on: all of it is history now.
      : 'cancelled';

export const CANCEL_REASONS = ['Change of plans', 'Found another time', 'Booked by mistake', 'Other'] as const;

/** Stored reasons stay English so the data survives a language switch; the
    label is translated at render time, falling back to whatever was saved. */
export const CANCEL_REASON_KEYS: Record<(typeof CANCEL_REASONS)[number], TKey> = {
  'Change of plans': 'bookings.reasonPlans',
  'Found another time': 'bookings.reasonAnotherTime',
  'Booked by mistake': 'bookings.reasonMistake',
  Other: 'bookings.reasonOther',
};

export const cancelReasonLabel = (reason: string, t: TFunction): string => {
  const key = CANCEL_REASON_KEYS[reason as (typeof CANCEL_REASONS)[number]];
  return key ? t(key) : reason;
};
