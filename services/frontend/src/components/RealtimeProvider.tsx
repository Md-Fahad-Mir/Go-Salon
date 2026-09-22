import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../hooks/useLanguage';
import { useRole } from '../hooks/useRole';
import { useAppStore } from '../store/useAppStore';
import type { Booking, BookingStatus } from '../types';
import { applyBookingEvent, readBookingEvent, resyncBookings } from '../utils/bookingFeed';
import { realtime } from '../utils/realtimeClient';
import { formatDayLabel, formatTime } from '../utils/format';

/** Holds the live booking connection open for as long as somebody is signed in.
 *
 *  The socket follows the session rather than the screen: a salon owner who is
 *  on their price list when a booking comes in should still hear about it, and
 *  a queue that only listened while it was mounted would miss it.
 *
 *  It re-opens on a new access token, and after a gap — a reconnection, a tab
 *  coming back from sleep, a laptop finding wifi again — the list is re-read
 *  instead of patched, because events that were never delivered cannot be
 *  recovered from the socket that missed them.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const token = useAppStore((state) => state.accessToken);
  const signedIn = useAppStore((state) => Boolean(state.user));
  const toast = useAppStore((state) => state.toast);
  const { isProvider } = useRole();
  const t = useT();

  /* A business is told out loud when work arrives, because the screen they are
     on is usually not the diary. Their own approvals and completions already
     have a toast of their own, so only new bookings speak up.

     Kept behind a ref so that changing language — or anything else that gives
     `t` a new identity — re-reads the greeting without tearing down a
     perfectly good socket. */
  const announce = useRef<(booking: Booking) => void>(() => {});
  useEffect(() => {
    announce.current = (booking: Booking) => {
      if (!isProvider) return;
      toast(
        'info',
        t('proQueue.liveNewBooking', { name: booking.customerName }),
        t('proQueue.liveNewBookingBody', {
          // The day as well as the hour: most bookings that arrive are not
          // for today, and "11:00" alone would read as if they were.
          day: formatDayLabel(booking.date),
          time: formatTime(booking.time),
          services: booking.services.map((service) => service.name).join(' · '),
        }),
      );
    };
  });

  /* The customer's half of the same idea. A business is told when work
     arrives; a customer is told when the salon answers — the moments that
     happen to them while they are somewhere else in the app.
 
     Only the three a salon does, and only on a real change of status, so a
     row that merely reappears says nothing. A cancellation is announced only
     when the business is the one who cancelled: the customer who cancels
     their own already knows, and `cancelledBy` is how the server says which
     it was. Nothing is announced for `created` — the customer just made it —
     or for `completed`, which happens while they are standing at the till. */
  const answer = useRef<(before: BookingStatus | undefined, booking: Booking) => void>(() => {});
  useEffect(() => {
    answer.current = (before, booking) => {
      if (isProvider || booking.status === before) return;
      const line =
        booking.status === 'approved' ? { tone: 'success' as const, title: 'booking.liveApproved' as const }
        : booking.status === 'rejected' ? { tone: 'warning' as const, title: 'booking.liveRejected' as const }
        : booking.status === 'cancelled' && booking.cancelledBy === 'business'
          ? { tone: 'warning' as const, title: 'booking.liveCancelled' as const }
          : null;
      if (!line) return;
      toast(
        line.tone,
        t(line.title),
        t('booking.liveAnswerBody', {
          name: booking.professionalName,
          day: formatDayLabel(booking.date),
          time: formatTime(booking.time),
        }),
      );
    };
  });

  useEffect(() => {
    if (!token || !signedIn) {
      realtime.disconnect();
      return;
    }

    const stop = realtime.on((message) => {
      const event = readBookingEvent(message);
      if (!event) return;
      /* Read before the fold: applying the event overwrites the row, and the
         status it had a moment ago is the only way to tell an answer from a
         row that simply arrived again. */
      const before = useAppStore.getState().getBooking(event.booking.id)?.status;
      applyBookingEvent(event.booking);
      if (event.event === 'created') announce.current(event.booking);
      else answer.current(before, event.booking);
    });

    realtime.onGap(() => void resyncBookings());
    realtime.connect(token);

    const recheck = () => {
      if (document.visibilityState === 'visible') realtime.check();
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('online', recheck);

    return () => {
      stop();
      realtime.onGap(null);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('online', recheck);
      realtime.disconnect();
    };
  }, [token, signedIn]);

  return <>{children}</>;
}
