/* Turning a live booking event into what is on screen.

   The socket only ever says "this row changed, here it is" — it never says
   what a screen should do about it, and it is never asked what the diary
   contains. That stays a REST answer, which is why every path out of a gap
   here ends in a re-read rather than in a guess.

   Which store the event lands in follows from the account, not from the
   message: a provider's diary and a customer's own bookings are different
   lists of the same rows, and the server has already decided which of them
   this person is looking at. */

import { isProviderRole } from '../constants';
import { useAppStore } from '../store/useAppStore';
import { useProviderStore } from '../store/useProviderStore';
import type { Booking } from '../types';
import { bookingService, toBooking, type ApiAppointment } from './bookingService';
import type { RealtimeMessage } from './realtimeClient';

export interface BookingEvent {
  /** `created` is a booking that did not exist; `updated` is a new state. */
  event: 'created' | 'updated';
  booking: Booking;
}

/** Reads one socket message, or nothing if it is not a booking event.

    Defensive on purpose: a message that does not look right is dropped rather
    than allowed to throw inside a socket handler, where nothing would catch
    it and the connection would be left in an odd state. */
export function readBookingEvent(message: RealtimeMessage): BookingEvent | null {
  if (message.type !== 'booking') return null;
  const raw = message.booking as ApiAppointment | undefined;
  if (!raw || typeof raw.id !== 'number') return null;
  try {
    return {
      event: message.event === 'created' ? 'created' : 'updated',
      booking: toBooking(raw),
    };
  } catch {
    return null;
  }
}

/** Folds an event into whichever list this account is looking at. */
export function applyBookingEvent(booking: Booking): void {
  const role = useAppStore.getState().user?.role;
  if (role && isProviderRole(role)) useProviderStore.getState().applyBookingEvent(booking);
  else useAppStore.getState().rememberBooking(booking);
}

/** Re-reads the list after a gap in the events.

    A socket that was down missed whatever happened while it was down, and no
    amount of patching can recover a message that was never delivered. The
    honest repair is to ask the server again. A failure here is left alone:
    what is already on screen is stale, not wrong, and the next attempt or a
    manual refresh will catch it. */
export async function resyncBookings(): Promise<void> {
  const role = useAppStore.getState().user?.role;
  if (!role) return;
  if (isProviderRole(role)) {
    await useProviderStore.getState().loadAppointments();
    return;
  }
  try {
    const { bookings } = await bookingService.list();
    useAppStore.getState().setBookings(bookings);
  } catch {
    // Keep what is on screen.
  }
}
