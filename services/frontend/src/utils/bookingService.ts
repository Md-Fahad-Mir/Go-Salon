/* Appointments, against the real diary.

   Availability is answered by the server, because only the server knows every
   chair's hours and what has already been sold — and because a slot list is
   only true for as long as it takes somebody else to take one. The booking
   call re-checks under a transaction, so a 409 here is not a bug: it is two
   people wanting four o'clock. */

import type {
  Booking,
  BookingService as BookingLine,
  BookingStatus,
  CancelledBy,
  ProviderAppointment,
  TakingsMethod,
} from '../types';
import { ApiValidationError, api } from './apiClient';
import { toReview, type ApiReview } from './reviewService';

/* --- What the wire looks like --------------------------------------------- */

interface ApiItem {
  id: number;
  service_id: number | null;
  name: string;
  price: number;
  duration_minutes: number;
}

interface ApiCan {
  approve: boolean;
  reject: boolean;
  complete: boolean;
  cancel: boolean;
  reschedule: boolean;
  call_to_cancel: boolean;
  review: boolean;
}

export interface ApiAppointment {
  id: number;
  status: BookingStatus;
  listing_id: string;
  business_name: string;
  business_phone: string;
  stylist_name: string;
  employee_id: number | null;
  customer_name: string;
  customer_phone: string;
  walk_in: boolean;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  buffer_minutes: number;
  starts_at: string;
  subtotal: string;
  platform_fee: string;
  total: string;
  /* How it was settled and what was left on top. Both are real columns on
     `Appointment` and `POST /complete/` writes them — but the appointment
     serializer does not list them yet, so they are absent from every response
     today. Optional rather than required for exactly that reason: the mapping
     below reads them the day the serializer carries them, and until then says
     "unknown" instead of inventing a value. */
  paid_with?: string;
  tip?: string | number;
  notes: string;
  reject_reason: string;
  cancel_reason: string;
  cancelled_by: CancelledBy | '';
  cancellation_window_hours: number;
  cancel_deadline: string;
  rescheduled_from_id: number | null;
  rescheduled_to_id: number | null;
  items: ApiItem[];
  can: ApiCan;
  /** The review of this visit, or null. Carried on the appointment because
      both sides of it start from the booking: the customer to see they have
      already rated it, the salon to answer. */
  review: ApiReview | null;
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
  notification?: { status: string; error: string };
}

interface ApiSlot {
  time: string;
  available: boolean;
  employee_ids: number[];
  reason: string;
}

interface ApiAvailability {
  date: string;
  duration_minutes: number;
  buffer_minutes: number;
  slots: ApiSlot[];
  detail?: string;
}

/* --- Mapping -------------------------------------------------------------- */

const hhmm = (value: string): string => value.slice(0, 5);

const toLine = (item: ApiItem): BookingLine => ({
  id: String(item.service_id ?? item.id),
  name: item.name,
  price: item.price,
  duration: item.duration_minutes,
});

export function toBooking(row: ApiAppointment): Booking {
  return {
    id: String(row.id),
    professionalId: row.listing_id,
    professionalName: row.business_name,
    businessPhone: row.business_phone,
    staffId: row.employee_id === null ? '' : String(row.employee_id),
    staffName: row.stylist_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    walkIn: row.walk_in,
    services: row.items.map(toLine),
    date: row.date,
    time: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    duration: row.duration_minutes,
    subtotal: Number(row.subtotal),
    platformFee: Number(row.platform_fee),
    total: Number(row.total),
    // An empty string is the server's "nobody said", and stays undefined here
    // rather than being rounded up to cash.
    paidWith: (row.paid_with || undefined) as Booking['paidWith'],
    tip: row.tip === undefined || row.tip === null ? undefined : Number(row.tip),
    status: row.status,
    notes: row.notes || undefined,
    rejectReason: row.reject_reason || undefined,
    cancelReason: row.cancel_reason || undefined,
    cancelledBy: row.cancelled_by || undefined,
    cancellationWindowHours: row.cancellation_window_hours,
    cancelDeadline: row.cancel_deadline,
    rescheduledFromId: row.rescheduled_from_id === null ? undefined : String(row.rescheduled_from_id),
    rescheduledToId: row.rescheduled_to_id === null ? undefined : String(row.rescheduled_to_id),
    can: {
      approve: row.can.approve,
      reject: row.can.reject,
      complete: row.can.complete,
      cancel: row.can.cancel,
      reschedule: row.can.reschedule,
      callToCancel: row.can.call_to_cancel,
      review: row.can.review,
    },
    review: row.review ? toReview(row.review) : undefined,
    startsAt: row.starts_at,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    /** Only present on the response to an approve or reject. */
    notification: row.notification
      ? { status: row.notification.status, error: row.notification.error }
      : undefined,
  };
}

export interface Slot {
  time: string;
  available: boolean;
  /** Which chairs are free then. Empty for a barber working alone. */
  employeeIds: string[];
  /** `too_soon` or `taken` — why a time is not on offer. */
  reason: string;
}

export interface Availability {
  date: string;
  durationMinutes: number;
  slots: Slot[];
  /** Set when the day is outside the window the diary opens for. */
  detail?: string;
}

/* --- Calls ---------------------------------------------------------------- */

export interface AvailabilityQuery {
  listing: string;
  date: string;
  serviceIds?: string[];
  employeeId?: string;
  /** The booking being moved, so its own slot is not reported as taken. */
  excludeId?: string;
}

export interface CreateBookingInput {
  listing: string;
  date: string;
  time: string;
  serviceIds: string[];
  employeeId?: string;
  notes?: string;
  rescheduleOf?: string;
}

/** Somebody added at the counter. No date or time: the server takes "now",
    because a walk-in is happening whether or not the grid has a slot for it.
    No listing either — the business is whoever is asking. */
export interface WalkInInput {
  customerName: string;
  customerPhone?: string;
  serviceIds: string[];
  /** The chair. An owner may choose one; an employee's is always their own,
      and the server ignores anything else they send. */
  employeeId?: string;
  notes?: string;
}

export interface BookingListQuery {
  status?: BookingStatus[];
  date?: string;
  upcoming?: boolean;
}

export interface BookingList {
  /** How the caller stands to these: `customer`, `owner`, `barber`, `employee`. */
  viewpoint: 'customer' | 'owner' | 'barber' | 'employee' | 'none';
  bookings: Booking[];
}

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** What the counter knows at the moment a booking is closed off. */
export interface CompletePayment {
  paidWith?: TakingsMethod;
  /** In BDT. Zero is a recorded "no tip"; leaving it out records nothing. */
  tip?: number;
}

export const bookingService = {
  async availability(input: AvailabilityQuery): Promise<Availability> {
    const data = await api.get<ApiAvailability>(
      `/bookings/availability/${query({
        listing: input.listing,
        date: input.date,
        service_ids: input.serviceIds?.join(','),
        employee: input.employeeId && input.employeeId !== 'any' ? input.employeeId : undefined,
        exclude: input.excludeId,
      })}`,
    );
    return {
      date: data.date,
      durationMinutes: data.duration_minutes,
      detail: data.detail,
      slots: data.slots.map((slot) => ({
        time: slot.time,
        available: slot.available,
        employeeIds: slot.employee_ids.map(String),
        reason: slot.reason,
      })),
    };
  },

  async create(input: CreateBookingInput): Promise<Booking> {
    return toBooking(
      await api.post<ApiAppointment>('/bookings/', {
        listing: input.listing,
        date: input.date,
        time: input.time,
        service_ids: input.serviceIds.map(Number),
        employee: input.employeeId && input.employeeId !== 'any' ? Number(input.employeeId) : undefined,
        notes: input.notes ?? '',
        reschedule_of: input.rescheduleOf ? Number(input.rescheduleOf) : undefined,
      }),
    );
  },

  async addWalkIn(input: WalkInInput): Promise<Booking> {
    return toBooking(
      await api.post<ApiAppointment>('/bookings/walk-in/', {
        customer_name: input.customerName,
        customer_phone: input.customerPhone ?? '',
        service_ids: input.serviceIds.map(Number),
        employee: input.employeeId ? Number(input.employeeId) : undefined,
        notes: input.notes ?? '',
      }),
    );
  },

  async list(filters: BookingListQuery = {}): Promise<BookingList> {
    const data = await api.get<{ viewpoint: BookingList['viewpoint']; results: ApiAppointment[] }>(
      `/bookings/${query({
        status: filters.status?.join(','),
        date: filters.date,
        upcoming: filters.upcoming ? 'true' : undefined,
      })}`,
    );
    return { viewpoint: data.viewpoint, bookings: data.results.map(toBooking) };
  },

  async get(id: string): Promise<Booking> {
    return toBooking(await api.get<ApiAppointment>(`/bookings/${id}/`));
  },

  async approve(id: string): Promise<Booking> {
    return toBooking(await api.post<ApiAppointment>(`/bookings/${id}/approve/`));
  },

  async reject(id: string, reason: string): Promise<Booking> {
    return toBooking(await api.post<ApiAppointment>(`/bookings/${id}/reject/`, { reason }));
  },

  /** Closes a booking off, and records how it was paid in the same call.
      Both parts are optional: the server keeps `paid_with` blank rather than
      guessing, and the reports give that its own bucket instead of calling it
      cash. An unknown method is a 400, so only `TakingsMethod` goes over. */
  async complete(id: string, payment: CompletePayment = {}): Promise<Booking> {
    return toBooking(
      await api.post<ApiAppointment>(`/bookings/${id}/complete/`, {
        paid_with: payment.paidWith,
        tip: payment.tip,
      }),
    );
  },

  async cancel(id: string, reason = ''): Promise<Booking> {
    return toBooking(await api.post<ApiAppointment>(`/bookings/${id}/cancel/`, { reason }));
  },

  async reschedule(id: string, input: { date: string; time: string; employeeId?: string }): Promise<Booking> {
    return toBooking(
      await api.post<ApiAppointment>(`/bookings/${id}/reschedule/`, {
        date: input.date,
        time: input.time,
        employee: input.employeeId && input.employeeId !== 'any' ? Number(input.employeeId) : undefined,
      }),
    );
  },
};

/** The server's answer when a customer is past the cancellation deadline: not
    "no", but "ring them", with something to dial. */
export interface CallToCancel {
  businessName: string;
  businessPhone: string;
  detail: string;
}

export function callToCancelOf(error: unknown): CallToCancel | null {
  if (!(error instanceof ApiValidationError) || error.code !== 'call_to_cancel') return null;
  return {
    businessName: error.detailOf('business_name') ?? '',
    businessPhone: error.detailOf('business_phone') ?? '',
    detail: error.message,
  };
}


/* --- The provider's view of the same appointment -------------------------- */

/** The salon's diary reads a different shape from the customer's list — a
    queue thinks in stages, not statuses — so one mapping turns a booking into
    the row the shop floor uses.

    `in_chair` and `no_show` are deliberately absent: they are the chair-side
    workflow, which has no backend yet, and the store keeps them locally. */
const STAGE_OF: Record<BookingStatus, ProviderAppointment['stage'] | null> = {
  pending: 'pending',
  approved: 'upcoming',
  completed: 'completed',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  // A booking that moved is history; the row that replaced it is the diary.
  rescheduled: null,
};

export function toProviderAppointment(booking: Booking): ProviderAppointment | null {
  const stage = STAGE_OF[booking.status];
  if (stage === null) return null;
  return {
    id: booking.id,
    providerId: booking.professionalId,
    staffId: booking.staffId || undefined,
    staffName: booking.staffName || undefined,
    customerId: booking.customerPhone,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    walkIn: booking.walkIn,
    isNewCustomer: false,
    services: booking.services.map((service) => ({
      id: service.id,
      name: service.name,
      price: service.price,
      duration: service.duration,
    })),
    date: booking.date,
    time: booking.time,
    duration: booking.duration,
    subtotal: booking.subtotal,
    total: booking.total,
    stage,
    completedAt: booking.completedAt,
    /* Carried through so the socket echo of a completion reinforces what the
       counter just recorded instead of erasing it. Undefined here means the
       server did not say — never "cash". */
    paidWith: booking.paidWith,
    tip: booking.tip,
    notes: booking.notes,
    createdAt: booking.createdAt,
    can: {
      approve: booking.can.approve,
      reject: booking.can.reject,
      complete: booking.can.complete,
      cancel: booking.can.cancel,
    },
  };
}
