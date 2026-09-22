import { useCallback, useMemo, useState } from 'react';
import type { Booking, Service, StaffMember } from '../types';
import { PLATFORM_FEE } from '../constants';
import { useDirectoryStore } from '../store/useDirectoryStore';
import { useAppStore } from '../store/useAppStore';
import { useBookingStore } from '../store/useBookingStore';
import { api, ApiError } from '../utils/api';
import { servicesLabel } from '../components/profile/bookingHelpers';

const NO_SERVICES: Service[] = [];
const NO_STAFF: StaffMember[] = [];

/** Everything the booking wizard screens need, derived from the draft. */
export function useBooking() {
  const draft = useBookingStore((s) => s.draft);
  const start = useBookingStore((s) => s.start);
  const toggleService = useBookingStore((s) => s.toggleService);
  const setServices = useBookingStore((s) => s.setServices);
  const setStaff = useBookingStore((s) => s.setStaff);
  const setDateTime = useBookingStore((s) => s.setDateTime);
  const setNotes = useBookingStore((s) => s.setNotes);
  const setAgreedPolicy = useBookingStore((s) => s.setAgreedPolicy);
  const setSmsReminder = useBookingStore((s) => s.setSmsReminder);
  const reset = useBookingStore((s) => s.reset);
  const rememberBooking = useAppStore((s) => s.rememberBooking);
  const pushNotification = useAppStore((s) => s.pushNotification);
  const [submitting, setSubmitting] = useState(false);

  /* Subscribed, not read once.

     These used to be `useMemo`s over the store's synchronous getters, keyed on
     the draft — which meant a listing that arrived *after* the wizard had
     opened never reached the screen: the draft had not changed, so the memo
     handed back the empty list it had computed before the fetch landed. The
     price list stayed blank with nothing to explain why. Selectors re-render
     when the answer changes, which is the whole point of holding the
     directory in a store. */
  const listingId = draft?.professionalId;
  const professional = useDirectoryStore((s) => (listingId ? s.byId[listingId] : undefined));
  const menu = useDirectoryStore((s) => (listingId ? s.servicesById[listingId] : undefined));
  const chairs = useDirectoryStore((s) => (listingId ? s.staffById[listingId] : undefined));
  // A stable empty array: a fresh `[]` from the selector would be a new
  // reference every render and never compare equal.
  const allServices = menu ?? NO_SERVICES;
  const staff = chairs ?? NO_STAFF;

  const services = useMemo(
    () => allServices.filter((s) => draft?.serviceIds.includes(s.id)),
    [allServices, draft?.serviceIds],
  );
  const staffMember = useMemo(
    () => staff.find((s) => s.id === draft?.staffId),
    [staff, draft?.staffId],
  );

  const subtotal = services.reduce((sum, s) => sum + s.price, 0);
  const duration = services.reduce((sum, s) => sum + s.duration, 0);
  const total = subtotal + PLATFORM_FEE;

  /** Books the slot — or moves the booking this draft replaces.

      Nothing is charged. A salon is paid at the chair, and there is no payment
      backend to take money through anyway; quoting a total the customer settles
      on the day is the honest version of that.

      The slot is only truly taken when the server says so. It re-checks under
      a transaction, so a `slot_taken` coming back here is somebody else having
      booked four o'clock while this customer was deciding; the wizard sends
      them back to pick again rather than pretending. */
  const confirm = useCallback(
    async (): Promise<Booking> => {
      if (!draft || !professional) throw new ApiError('no_draft', 'Start a booking first.');
      if (!draft.date || !draft.time) throw new ApiError('incomplete', 'Pick a date and a time.');
      setSubmitting(true);
      try {
        if (draft.rescheduleOf) {
          // Moving a booking is free: nothing is charged again.
          const moved = await api.bookings.reschedule(draft.rescheduleOf, {
            date: draft.date,
            time: draft.time,
            employeeId: draft.staffId,
          });
          rememberBooking(moved);
          // The row it replaced is closed now, so its cached copy is stale.
          const previous = useAppStore.getState().getBooking(draft.rescheduleOf);
          if (previous) {
            rememberBooking({ ...previous, status: 'rescheduled', rescheduledToId: moved.id });
          }
          pushNotification({
            kind: 'booking',
            title: 'Booking moved',
            body: `${servicesLabel(moved)} at ${moved.professionalName} is now on a new slot.`,
            link: `/bookings/${moved.id}`,
          });
          reset();
          return moved;
        }

        const booking = await api.bookings.create({
          listing: draft.professionalId,
          date: draft.date,
          time: draft.time,
          serviceIds: draft.serviceIds,
          employeeId: draft.staffId,
          notes: draft.notes,
        });
        // The reminder preference and the style they came in for are this
        // device's business; the server holds everything else.
        const withLocal: Booking = {
          ...booking,
          smsReminder: draft.smsReminder,
          hairstyleId: draft.hairstyleId,
        };
        rememberBooking(withLocal);
        pushNotification({
          kind: 'booking',
          title: booking.status === 'approved' ? 'Booking confirmed' : 'Awaiting approval',
          body:
            booking.status === 'approved'
              ? `${professional.name} confirmed your ${services[0]?.name.toLowerCase() ?? 'appointment'}.`
              : `${professional.name} approves bookings by hand. They will text you when they answer.`,
          link: `/bookings/${booking.id}`,
        });
        reset();
        return withLocal;
      } finally {
        setSubmitting(false);
      }
    },
    [draft, professional, pushNotification, rememberBooking, reset, services],
  );

  return {
    draft,
    professional,
    allServices,
    services,
    staff,
    staffMember,
    subtotal,
    duration,
    platformFee: PLATFORM_FEE,
    total,
    submitting,
    confirm,
    start,
    toggleService,
    setServices,
    setStaff,
    setDateTime,
    setNotes,
    setAgreedPolicy,
    setSmsReminder,
    reset,
  };
}
