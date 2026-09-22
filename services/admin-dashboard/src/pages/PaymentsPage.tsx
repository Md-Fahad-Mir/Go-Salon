import { useMemo, useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { Plus, Undo2 } from 'lucide-react';
import type { AiGenerationCharge, PaymentMethod, Transaction, TransactionStatus } from '../types';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_VARS } from '../constants';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { ShareBar } from '../components/charts/ShareBar';
import { TransactionStatusBadge } from '../components/ui/StatusBadge';
import { Badge } from '../components/ui/Badge';
import {
  formatBdt,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatSeconds,
  formatUsd,
  titleCase,
} from '../utils/format';

const METHODS: PaymentMethod[] = ['bkash', 'nagad', 'rocket', 'card'];
const STATUSES: TransactionStatus[] = ['completed', 'pending', 'failed', 'refunded'];

export default function PaymentsPage() {
  const transactions = useStore((state) => state.transactions);
  const aiCharges = useStore((state) => state.aiCharges);
  const bookings = useStore((state) => state.bookings);
  const refundTransaction = useStore((state) => state.refundTransaction);
  const recordManualPayment = useStore((state) => state.recordManualPayment);

  const [tab, setTab] = useState<'transactions' | 'ai'>('transactions');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ bookingId: '', amount: 500, method: 'bkash' as PaymentMethod });

  const totals = useMemo(() => {
    const settled = transactions.filter((item) => item.status === 'completed');
    const gross = settled.reduce((sum, item) => sum + item.totalAmount, 0);
    const fees = settled.reduce((sum, item) => sum + item.platformFee, 0);
    const refunds = transactions
      .filter((item) => item.status === 'refunded')
      .reduce((sum, item) => sum + item.totalAmount, 0);
    return { gross, fees, payouts: gross - fees, refunds };
  }, [transactions]);

  const methodSlices = useMemo(
    () =>
      METHODS.map((method) => ({
        method,
        label: PAYMENT_METHOD_LABELS[method],
        amount: transactions
          .filter((item) => item.paymentMethod === method && item.status === 'completed')
          .reduce((sum, item) => sum + item.totalAmount, 0),
        color: PAYMENT_METHOD_VARS[method],
      })).filter((slice) => slice.amount > 0),
    [transactions],
  );

  const aiTotals = useMemo(() => {
    const success = aiCharges.filter((item) => item.outcome === 'success');
    return {
      images: success.reduce((sum, item) => sum + item.images, 0),
      revenue: aiCharges.reduce((sum, item) => sum + item.charge, 0),
      cost: aiCharges.reduce((sum, item) => sum + item.cost, 0),
      failed: aiCharges.length - success.length,
      successRate: (success.length / Math.max(1, aiCharges.length)) * 100,
    };
  }, [aiCharges]);

  const filters = useMemo(
    () => [
      {
        key: 'method',
        label: 'Method',
        options: METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] })),
        match: (row: Transaction, value: string) => row.paymentMethod === value,
      },
      {
        key: 'status',
        label: 'Status',
        options: STATUSES.map((value) => ({ value, label: titleCase(value) })),
        match: (row: Transaction, value: string) => row.status === value,
      },
      {
        key: 'range',
        label: 'Period',
        options: [
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
        ],
        match: (row: Transaction, value: string) =>
          Math.abs(differenceInCalendarDays(new Date(row.date), new Date())) <= Number(value),
      },
    ],
    [],
  );

  const table = useTableState<Transaction>({
    rows: transactions,
    searchOn: (row) => [row.id, row.bookingId, row.customerName, row.businessName, row.reference],
    filters,
    sortAccessors: {
      date: (row) => row.date,
      totalAmount: (row) => row.totalAmount,
    },
    initialSort: { key: 'date', direction: 'desc' },
  });

  const aiTable = useTableState<AiGenerationCharge>({
    rows: aiCharges,
    searchOn: (row) => [row.id, row.userName, row.hairstyleName],
    sortAccessors: { date: (row) => row.date, charge: (row) => row.charge },
    initialSort: { key: 'date', direction: 'desc' },
  });

  const transactionColumns: Array<Column<Transaction>> = [
    {
      key: 'id',
      header: 'Transaction',
      hideOnCard: true,
      render: (row) => (
        <div>
          <div className="cell-strong mono">{row.id}</div>
          <div className="dim mono">{row.bookingId}</div>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <div>
          <div className="cell-strong truncate">{row.customerName}</div>
          <div className="dim truncate">{row.businessName}</div>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (row) => (
        <span className="row">
          <span
            className="dot"
            style={{
              width: '0.5rem',
              height: '0.5rem',
              borderRadius: '50%',
              backgroundColor: PAYMENT_METHOD_VARS[row.paymentMethod],
            }}
            aria-hidden="true"
          />
          {PAYMENT_METHOD_LABELS[row.paymentMethod]}
        </span>
      ),
    },
    { key: 'amount', header: 'Service', align: 'end', render: (row) => formatBdt(row.amount) },
    { key: 'platformFee', header: 'Fee', align: 'end', render: (row) => formatBdt(row.platformFee) },
    {
      key: 'totalAmount',
      header: 'Total',
      sortable: true,
      align: 'end',
      render: (row) => <span className="cell-strong">{formatBdt(row.totalAmount)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <TransactionStatusBadge status={row.status} /> },
    { key: 'date', header: 'Date', sortable: true, render: (row) => formatDateTime(row.date) },
  ];

  const aiColumns: Array<Column<AiGenerationCharge>> = [
    { key: 'id', header: 'Request', hideOnCard: true, render: (row) => <span className="mono">{row.id}</span> },
    { key: 'userName', header: 'User', render: (row) => row.userName },
    { key: 'hairstyleName', header: 'Hairstyle', render: (row) => row.hairstyleName },
    { key: 'images', header: 'Images', align: 'end', render: (row) => row.images },
    {
      key: 'latencySeconds',
      header: 'Latency',
      align: 'end',
      render: (row) => formatSeconds(row.latencySeconds),
    },
    {
      key: 'charge',
      header: 'Charged',
      sortable: true,
      align: 'end',
      render: (row) => (row.charge ? formatBdt(row.charge) : '—'),
    },
    { key: 'cost', header: 'AI cost', align: 'end', render: (row) => formatUsd(row.cost) },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) => (
        <Badge tone={row.outcome === 'success' ? 'success' : 'danger'}>{titleCase(row.outcome)}</Badge>
      ),
    },
    { key: 'date', header: 'When', sortable: true, render: (row) => formatDateTime(row.date) },
  ];

  return (
    <>
      <PageHeader
        title="Payments & revenue"
        description="Booking settlements, platform fees and AI generation charges."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setManualOpen(true)}>
            <Plus size={16} /> Record payment
          </button>
        }
      />

      <dl className="stat-row" style={{ marginBottom: '1rem' }}>
        <div className="stat">
          <dt>Gross revenue</dt>
          <dd>{formatBdt(totals.gross)}</dd>
        </div>
        <div className="stat">
          <dt>Platform fees</dt>
          <dd>{formatBdt(totals.fees)}</dd>
        </div>
        <div className="stat">
          <dt>Provider payouts</dt>
          <dd>{formatBdt(totals.payouts)}</dd>
        </div>
        <div className="stat">
          <dt>Refunded</dt>
          <dd>{formatBdt(totals.refunds)}</dd>
        </div>
      </dl>

      <div className="analytics-grid" style={{ marginBottom: '1rem' }}>
        <section className="card" aria-labelledby="method-heading">
          <div className="card-head">
            <h2 id="method-heading">Settled by payment method</h2>
            <span className="card-sub">completed transactions only</span>
          </div>
          <div className="card-body">
            <ShareBar slices={methodSlices} exact />
          </div>
        </section>

        <section className="card" aria-labelledby="ai-heading">
          <div className="card-head">
            <h2 id="ai-heading">AI generation revenue</h2>
            <span className="card-sub">Advanced subscribers</span>
          </div>
          <div className="card-body">
            <dl className="stat-row">
              <div className="stat">
                <dt>Images generated</dt>
                <dd>{formatNumber(aiTotals.images)}</dd>
              </div>
              <div className="stat">
                <dt>Charged</dt>
                <dd>{formatBdt(aiTotals.revenue)}</dd>
              </div>
              <div className="stat">
                <dt>Model cost</dt>
                <dd>{formatUsd(aiTotals.cost)}</dd>
              </div>
              <div className="stat">
                <dt>Success rate</dt>
                <dd>{formatPercent(aiTotals.successRate)}</dd>
              </div>
            </dl>
            <p className="hint">
              {aiTotals.failed} failed request{aiTotals.failed === 1 ? '' : 's'} in this window — failures are never
              charged to the subscriber.
            </p>
          </div>
        </section>
      </div>

      <section className="card">
        <div style={{ padding: '0 1rem' }}>
          <Tabs
            label="Payment records"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'transactions', label: 'Transactions', count: transactions.length },
              { id: 'ai', label: 'AI generations', count: aiCharges.length },
            ]}
          />
        </div>

        {tab === 'transactions' ? (
          <>
            <FilterBar
              query={table.query}
              onQueryChange={table.setQuery}
              placeholder="Search by transaction, booking or reference…"
              controls={filters}
              values={table.filterValues}
              onFilterChange={table.setFilter}
              chips={table.activeChips}
              onClearAll={table.clearFilters}
            />

            <DataTable
              caption="Booking transactions"
              columns={transactionColumns}
              rows={table.rows}
              rowKey={(row) => row.id}
              sort={table.sort}
              onSort={table.toggleSort}
              actions={(row) =>
                row.status === 'completed' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => refundTransaction(row.id)}
                  >
                    <Undo2 size={14} /> Refund
                  </button>
                ) : (
                  <span className="dim" style={{ fontSize: '0.75rem' }}>
                    —
                  </span>
                )
              }
              cardTitle={(row) => `${row.id} · ${formatBdt(row.totalAmount)}`}
              emptyTitle="No transactions match"
            />

            <Pagination
              page={table.page}
              pageCount={table.pageCount}
              pageSize={table.pageSize}
              total={table.total}
              onPageChange={table.setPage}
              onPageSizeChange={table.setPageSize}
            />
          </>
        ) : (
          <>
            <FilterBar
              query={aiTable.query}
              onQueryChange={aiTable.setQuery}
              placeholder="Search by user or hairstyle…"
              values={aiTable.filterValues}
              onFilterChange={aiTable.setFilter}
              chips={aiTable.activeChips}
              onClearAll={aiTable.clearFilters}
            />

            <DataTable
              caption="AI generation charges"
              columns={aiColumns}
              rows={aiTable.rows}
              rowKey={(row) => row.id}
              sort={aiTable.sort}
              onSort={aiTable.toggleSort}
              cardTitle={(row) => `${row.userName} · ${row.hairstyleName}`}
              emptyTitle="No generation charges"
            />

            <Pagination
              page={aiTable.page}
              pageCount={aiTable.pageCount}
              pageSize={aiTable.pageSize}
              total={aiTable.total}
              onPageChange={aiTable.setPage}
              onPageSizeChange={aiTable.setPageSize}
            />
          </>
        )}
      </section>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Record a manual payment"
        description="Use this when a customer paid the salon directly and the booking needs settling."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!manual.bookingId || manual.amount <= 0}
              onClick={() => {
                recordManualPayment(manual);
                setManualOpen(false);
              }}
            >
              Record payment
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Booking" required>
            <select
              className="select"
              value={manual.bookingId}
              onChange={(event) => {
                const booking = bookings.find((item) => item.id === event.target.value);
                setManual({
                  ...manual,
                  bookingId: event.target.value,
                  amount: booking?.amount ?? manual.amount,
                });
              }}
            >
              <option value="">Select a booking…</option>
              {bookings.slice(0, 25).map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.id} · {booking.customerName} · {booking.businessName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Service amount (৳)" required>
            <input
              className="input"
              type="number"
              min={0}
              value={manual.amount}
              onChange={(event) => setManual({ ...manual, amount: Number(event.target.value) })}
            />
          </Field>

          <Field label="Method">
            <select
              className="select"
              value={manual.method}
              onChange={(event) => setManual({ ...manual, method: event.target.value as PaymentMethod })}
            >
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </Field>

          <p className="note">
            The platform fee is added on top automatically from the current settings value.
          </p>
        </div>
      </Modal>
    </>
  );
}
