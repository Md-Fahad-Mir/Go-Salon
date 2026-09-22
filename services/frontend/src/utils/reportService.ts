/* What the business took, answered by the database rather than by the phone.

   Both report screens — the owner's Analytics and an employee's Performance —
   used to add up the rows the client happened to be holding. That list is
   capped and ordered by the furthest future appointment, so the completed
   history was the first thing to fall off the end, and the window was built
   from the device clock rather than the salon's. Every total was quietly too
   low and nothing on the screen said so.

   So the arithmetic lives on the server, behind `Apps/bookings/access.py`, and
   these two calls only translate it. Nothing here sums anything.

   MONEY ARRIVES AS A DECIMAL STRING. It is converted to a number exactly once,
   here at the boundary, so no screen re-rounds a figure the server already
   settled. `formatBdt` does the rest.

   WHAT THE FIGURES MEAN, because the names are not interchangeable:

     revenue       the services at the salon's own prices — `Sum(subtotal)`.
     platformFees  the platform's cut, charged on top. Not the salon's money,
                   which is why it is a separate field and never in `revenue`.
     tips          reported only. A tip is the stylist's: never revenue, never
                   commissioned.

   Revenue is bucketed by the day the work was marked done on the salon's own
   clock, not by the day the chair was booked. */

import { TAKINGS_METHODS } from '../constants';
import type { TakingsMethod } from '../types';
import { api } from './apiClient';
import type { BookingList } from './bookingService';

/** How the caller stands to the rows behind a report. The server decides it
    from the account; no query string can widen it. */
export type ReportViewpoint = BookingList['viewpoint'];

export type ReportPeriod = 'week' | 'month';

/** A recorded method, or the absence of one. `unrecorded` is an appointment
    completed without anybody saying how it was paid — which is NOT cash, and
    must never be labelled as cash on any screen. */
export type ReportPaymentMethod = TakingsMethod | 'unrecorded';

/* --- What the wire looks like --------------------------------------------- */

interface ApiHeadline {
  revenue: string;
  platform_fees: string;
  tips: string;
  bookings: number;
  average_ticket: string;
}

interface ApiDay {
  date: string;
  revenue: string;
  bookings: number;
}

interface ApiServiceRow {
  name: string;
  revenue: string;
  bookings: number;
}

interface ApiStaffRow {
  employee_id: string;
  name: string;
  revenue: string;
  bookings: number;
  commission_rate: number;
  commission: string;
}

interface ApiPaymentRow {
  method: string;
  revenue: string;
  bookings: number;
}

interface ApiBucket {
  revenue: string;
  bookings: number;
}

interface ApiAnalytics {
  viewpoint: ReportViewpoint;
  period: ReportPeriod;
  from: string;
  to: string;
  headline: ApiHeadline;
  returning: { repeat: number; first_time: number; repeat_share: number };
  series: ApiDay[];
  by_staff: ApiStaffRow[];
  unassigned: ApiBucket;
  by_service: ApiServiceRow[];
  by_payment: ApiPaymentRow[];
}

interface ApiPerformance {
  viewpoint: ReportViewpoint;
  period: ReportPeriod;
  from: string;
  to: string;
  headline: ApiHeadline;
  series: ApiDay[];
  by_service: ApiServiceRow[];
  commission_rate: number | null;
  commission: string | null;
  salon: string | null;
}

/* --- What the app reads --------------------------------------------------- */

export interface ReportHeadline {
  /** The services, at the salon's prices. The platform fee is not in here. */
  revenue: number;
  /** Charged on top of the services and collected by the platform. */
  platformFees: number;
  /** The stylist's, in full. Never added to revenue, never commissioned. */
  tips: number;
  bookings: number;
  averageTicket: number;
}

export interface ReportDay {
  /** `yyyy-MM-dd`, the salon's own day. Every day in the window is present,
      zeros included, so a chart keeps the same x-axis all week. */
  date: string;
  revenue: number;
  bookings: number;
}

export interface ReportServiceRow {
  /** The name frozen on the line, so a renamed service still reports under
      what it was sold as. */
  name: string;
  revenue: number;
  bookings: number;
}

export interface ReportStaffRow {
  employeeId: string;
  name: string;
  revenue: number;
  bookings: number;
  /** The rate on the employment TODAY. Nothing records what the split was on
      the day, so a screen showing this must say "current rate" rather than
      presenting it as history. */
  commissionRate: number;
  commission: number;
}

export interface ReportPaymentRow {
  method: ReportPaymentMethod;
  revenue: number;
  bookings: number;
}

export interface ReportBucket {
  revenue: number;
  bookings: number;
}

export interface ReportReturning {
  repeat: number;
  firstTime: number;
  /** Whole percent. Real, and routinely not 100. */
  repeatShare: number;
}

export interface AnalyticsReport {
  viewpoint: ReportViewpoint;
  period: ReportPeriod;
  /** The first and last day the figures cover, inclusive. */
  from: string;
  to: string;
  headline: ReportHeadline;
  returning: ReportReturning;
  series: ReportDay[];
  byStaff: ReportStaffRow[];
  /** Revenue with no chair against it. Not a person: it must not join the
      staff ranking, where the first row is styled as the leader. */
  unassigned: ReportBucket;
  byService: ReportServiceRow[];
  byPayment: ReportPaymentRow[];
}

export interface PerformanceReport {
  viewpoint: ReportViewpoint;
  period: ReportPeriod;
  from: string;
  to: string;
  headline: ReportHeadline;
  series: ReportDay[];
  byService: ReportServiceRow[];
  /** Null when the account has no active employment to read a rate from. */
  commissionRate: number | null;
  commission: number | null;
  salon: string | null;
}

/* --- Mapping -------------------------------------------------------------- */

/** A decimal string to a number, once. A malformed figure reads as zero rather
    than spreading NaN through every total on the screen. */
const money = (value: string): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

/* The methods a till can actually record, read from the one list the screens
   draw and label them from rather than spelled out again here. Writing the
   five out twice would let this file and `TAKINGS_METHODS` drift in silence,
   and a method missing from this set would arrive on screen as "Not recorded"
   — inventing the absence of an answer instead of reporting the one given.

   Anything outside it — including the blank the server stores for work
   completed before anybody was asked — becomes `unrecorded`, never cash. */
const RECORDED: ReadonlySet<string> = new Set<TakingsMethod>(
  TAKINGS_METHODS.map((entry) => entry.id),
);

const toMethod = (value: string): ReportPaymentMethod =>
  RECORDED.has(value) ? (value as TakingsMethod) : 'unrecorded';

const toHeadline = (row: ApiHeadline): ReportHeadline => ({
  revenue: money(row.revenue),
  platformFees: money(row.platform_fees),
  tips: money(row.tips),
  bookings: row.bookings,
  averageTicket: money(row.average_ticket),
});

const toDay = (row: ApiDay): ReportDay => ({
  date: row.date,
  revenue: money(row.revenue),
  bookings: row.bookings,
});

const toServiceRow = (row: ApiServiceRow): ReportServiceRow => ({
  name: row.name,
  revenue: money(row.revenue),
  bookings: row.bookings,
});

const toStaffRow = (row: ApiStaffRow): ReportStaffRow => ({
  employeeId: row.employee_id,
  name: row.name,
  revenue: money(row.revenue),
  bookings: row.bookings,
  commissionRate: row.commission_rate,
  commission: money(row.commission),
});

const toPaymentRow = (row: ApiPaymentRow): ReportPaymentRow => ({
  method: toMethod(row.method),
  revenue: money(row.revenue),
  bookings: row.bookings,
});

const toBucket = (row: ApiBucket): ReportBucket => ({
  revenue: money(row.revenue),
  bookings: row.bookings,
});

/* --- Calls ---------------------------------------------------------------- */

const query = (period: ReportPeriod): string => `?${new URLSearchParams({ period }).toString()}`;

export const reportService = {
  /** What the salon took. Scoped by the server: an employee asking gets their
      own chair, an owner gets the shop. */
  async analytics(period: ReportPeriod): Promise<AnalyticsReport> {
    const data = await api.get<ApiAnalytics>(`/bookings/analytics/${query(period)}`);
    return {
      viewpoint: data.viewpoint,
      period: data.period,
      from: data.from,
      to: data.to,
      headline: toHeadline(data.headline),
      returning: {
        repeat: data.returning.repeat,
        firstTime: data.returning.first_time,
        repeatShare: data.returning.repeat_share,
      },
      series: data.series.map(toDay),
      byStaff: data.by_staff.map(toStaffRow),
      unassigned: toBucket(data.unassigned),
      byService: data.by_service.map(toServiceRow),
      byPayment: data.by_payment.map(toPaymentRow),
    };
  },

  /** How one stylist did, for their own screen. The server refuses this to
      anybody whose viewpoint is not `employee`, so an owner calling it gets a
      403 rather than the whole salon under a heading that says "you". */
  async performance(period: ReportPeriod): Promise<PerformanceReport> {
    const data = await api.get<ApiPerformance>(`/bookings/performance/${query(period)}`);
    return {
      viewpoint: data.viewpoint,
      period: data.period,
      from: data.from,
      to: data.to,
      headline: toHeadline(data.headline),
      series: data.series.map(toDay),
      byService: data.by_service.map(toServiceRow),
      commissionRate: data.commission_rate,
      commission: data.commission === null ? null : money(data.commission),
      salon: data.salon,
    };
  },
};
