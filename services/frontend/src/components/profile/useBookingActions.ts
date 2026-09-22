import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Booking } from '../../types';
import { ROUTES } from '../../constants';
import { useBookingStore } from '../../store/useBookingStore';

/** Hands a past or upcoming booking to the booking wizard. */
export function useBookingActions() {
  const navigate = useNavigate();

  const rebook = useCallback(
    (booking: Booking) => {
      useBookingStore.getState().start(booking.professionalId, {
        serviceIds: booking.services.map((s) => s.id),
        staffId: booking.staffId,
        hairstyleId: booking.hairstyleId,
      });
      navigate(ROUTES.bookingStaff(booking.professionalId));
    },
    [navigate],
  );

  const reschedule = useCallback(
    (booking: Booking) => {
      useBookingStore.getState().start(booking.professionalId, {
        rescheduleOf: booking.id,
        serviceIds: booking.services.map((s) => s.id),
        staffId: booking.staffId,
      });
      navigate(ROUTES.bookingDateTime(booking.professionalId));
    },
    [navigate],
  );

  return { rebook, reschedule };
}
