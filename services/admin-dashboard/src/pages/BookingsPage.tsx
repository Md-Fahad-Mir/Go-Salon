import { useMemo, useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { Check, X } from 'lucide-react';
import type { Booking, BookingStatus } from '../types';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { BookingStatusBadge } from '../components/ui/StatusBadge';
import { Badge } from '../components/ui/Badge';
import { formatBdt, formatDate, formatDuration, formatRelative, titleCase } from '../utils/format';

const STATUSES: BookingStatus[] = [
  'pending',
  'approved',
  'completed',
  'rejected',
  'cancelled',
  'rescheduled',
];

const withinRange = (iso: string, range: string): boolean => {
  const delta = differenceInCalendarDays(new Date(iso), new Date());
  if (range === 'upcoming') return delta >= 0;
  if (range === 'next7') return delta >= 0 && delta <= 7;
  if (range === 'last7') return delta <= 0 && delta >= -7;
  if (range === 'last30') return delta <= 0 && delta >= -30;
  return true;
};

export default function BookingsPage() {
  const bookings = useStore((state) => state.bookings);
  const setBookingStatus = useStore((state) => state.setBookingStatus);
  const settings = useStore((state) => state.settings);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const filters = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        options: STATUSES.map((value) => ({ value, label: titleCase(value) })),
        match: (row: Booking, value: string) => row.status === value,
      },
      {
        key: 'mode',
        label: 'Mode',
        options: [
          { value: 'auto', label: 'Auto-accept' },
          { value: 'manual', label: 'Manual accept' },
        ],
        match: (row: Booking, value: string) => row.acceptanceMode === value,
      },
      {
        key: 'range',
        label: 'Date',
        options: [
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'next7', label: 'Next 7 days' },
          { value: 'last7', label: 'Last 7 days' },
          { value: 'last30', label: 'Last 30 days' },
        ],
        match: (row: Booking, value: string) => withinRange(row.appointmentDate, value),
      },
    ],
    [],
  );

  const table = useTableState<Booking>({
    rows: bookings,
    searchOn: (row) => [row.id, row.customerName, row.businessName, row.serviceName, row.customerPhone],
    filters,
    sortAccessors: {
      appointmentDate: (row) => row.appointmentDate,
      totalAmount: (row) => row.totalAmount,
      customerName: (row) => row.customerName,
    },
    initialSort: { key: 'appointmentDate', direction: 'desc' },
  });

  const pendingCount = bookings.filter((booking) => booking.status === 'pending').length;

  // With nothing picked yet, open on the soonest booking still waiting on a
  // decision — the one an admin came to this page to deal with.
  const fallback = useMemo(
    () =>
      [...bookings]
        .filter((booking) => booking.status === 'pending')
        .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))[0] ?? null,
    [bookings],
  );
  const selected = selectedId
    ? (bookings.find((booking) => booking.id === selectedId) ?? null)
    : fallback;

  const columns: Array<Column<Booking>> = [
    {
      key: 'id',
      header: 'Booking',
      hideOnCard: true,
      render: (row) => (
        <div>
          <div className="cell-strong mono">{row.id}</div>
          <div className="dim">{formatRelative(row.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      render: (row) => (
        <div>
          <div className="cell-strong truncate">{row.customerName}</div>
          <div className="dim truncate">{row.businessName}</div>
        </div>
      ),
    },
    {
      key: 'appointmentDate',
      header: 'Appointment',
      sortable: true,
      render: (row) => (
        <div>
          <div className="cell-strong">{formatDate(row.appointmentDate)}</div>
          <div className="dim">{row.appointmentTime}</div>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total',
      sortable: true,
      align: 'end',
      render: (row) => formatBdt(row.totalAmount),
    },
    { key: 'status', header: 'Status', render: (row) => <BookingStatusBadge status={row.status} /> },
  ];

  const decide = (booking: Booking, status: BookingStatus) => {
    setBookingStatus(booking.id, status, reason.trim() || undefined);
    setReason('');
  };

  return (
    <>
      <PageHeader
        title="Bookings monitor"
        description={`${bookings.length} bookings · ${pendingCount} waiting on a manual decision · free cancellation up to ${settings.cancellationWindowHours} hours before the slot`}
      />

      <div className="workspace">
        <section className="card">
          <FilterBar
            query={table.query}
            onQueryChange={table.setQuery}
            placeholder="Search by booking ID, customer or business…"
            controls={filters}
            values={table.filterValues}
            onFilterChange={table.setFilter}
            chips={table.activeChips}
            onClearAll={table.clearFilters}
          />

          <DataTable
            caption="All bookings"
            columns={columns}
            rows={table.rows}
            rowKey={(row) => row.id}
            sort={table.sort}
            onSort={table.toggleSort}
            onRowClick={(row) => {
              setSelectedId(row.id);
              setReason('');
            }}
            cardTitle={(row) => `${row.id} · ${row.customerName}`}
            cardActions={(row) => (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectedId(row.id);
                  setReason('');
                }}
              >
                Open details
              </button>
            )}
            emptyTitle="No bookings match"
          />

          <Pagination
            page={table.page}
            pageCount={table.pageCount}
            pageSize={table.pageSize}
            total={table.total}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
          />
        </section>

        <aside className="workspace-sticky">
          <section className="card" aria-live="polite">
            {selected ? (
              <>
                <div className="card-head">
                  <div style={{ minWidth: 0 }}>
                    <h2 className="truncate">{selected.customerName}</h2>
                    <p className="card-sub mono">{selected.id}</p>
                  </div>
                  <BookingStatusBadge status={selected.status} />
                </div>

                <div className="card-body stack">
                  <dl className="dl dl-2">
                    <div>
                      <dt>Business</dt>
                      <dd>{selected.businessName}</dd>
                    </div>
                    <div>
                      <dt>Service</dt>
                      <dd>
                        {selected.serviceName} · {formatDuration(selected.serviceDuration)}
                      </dd>
                    </div>
                    <div>
                      <dt>Appointment</dt>
                      <dd>
                        {formatDate(selected.appointmentDate)} · {selected.appointmentTime}
                      </dd>
                    </div>
                    <div>
                      <dt>Booked</dt>
                      <dd>{formatRelative(selected.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Customer phone</dt>
                      <dd className="mono">{selected.customerPhone}</dd>
                    </div>
                    <div>
                      <dt>Acceptance</dt>
                      <dd>
                        <Badge tone={selected.acceptanceMode === 'auto' ? 'info' : 'warning'}>
                          {selected.acceptanceMode === 'auto' ? 'Auto-accept' : 'Manual accept'}
                        </Badge>
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <h3 className="section-label">Payment</h3>
                    <div className="hours-grid">
                      <div className="hours-row">
                        <span className="day">Service</span>
                        <span className="time">{formatBdt(selected.amount)}</span>
                      </div>
                      <div className="hours-row">
                        <span className="day">Platform fee</span>
                        <span className="time">{formatBdt(selected.platformFee)}</span>
                      </div>
                      <div className="hours-row">
                        <span className="day strong">Total</span>
                        <span className="time strong">{formatBdt(selected.totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {selected.notes ? (
                    <div>
                      <h3 className="section-label">Customer note</h3>
                      <p>{selected.notes}</p>
                    </div>
                  ) : null}

                  {selected.reason ? (
                    <p className="note note-warn">{selected.reason}</p>
                  ) : null}

                  {selected.status === 'pending' ? (
                    <div className="stack-sm">
                      <label className="label" htmlFor="decision-reason">
                        Reason (sent to the customer if you decline)
                      </label>
                      <textarea
                        id="decision-reason"
                        className="textarea"
                        value={reason}
                        placeholder="e.g. the stylist is unavailable at that time"
                        onChange={(event) => setReason(event.target.value)}
                      />
                      <div className="row">
                        <button type="button" className="btn btn-primary" onClick={() => decide(selected, 'approved')}>
                          <Check size={15} /> Approve booking
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => decide(selected, 'rejected')}>
                          <X size={15} /> Decline
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selected.status === 'approved' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      onClick={() => setBookingStatus(selected.id, 'cancelled', 'Cancelled by admin')}
                    >
                      Cancel booking
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                title="Select a booking"
                message="Pick a row to see the full breakdown, the customer note and the approve/decline controls."
              />
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
