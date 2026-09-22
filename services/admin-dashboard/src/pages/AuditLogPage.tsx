import { useMemo, useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { Eye } from 'lucide-react';
import type { AuditLogEntry } from '../types';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { formatDateTime, formatRelative, titleCase } from '../utils/format';

const ACTION_TONES: Record<AuditLogEntry['actionType'], 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  create: 'success',
  update: 'info',
  approve: 'success',
  reject: 'danger',
  delete: 'danger',
  suspend: 'warning',
  login: 'neutral',
};

export default function AuditLogPage() {
  const auditLog = useStore((state) => state.auditLog);
  const [viewing, setViewing] = useState<AuditLogEntry | null>(null);

  const resourceTypes = useMemo(
    () => [...new Set(auditLog.map((entry) => entry.resourceType))].sort(),
    [auditLog],
  );

  const filters = useMemo(
    () => [
      {
        key: 'actionType',
        label: 'Action',
        options: (Object.keys(ACTION_TONES) as Array<AuditLogEntry['actionType']>).map((value) => ({
          value,
          label: titleCase(value),
        })),
        match: (row: AuditLogEntry, value: string) => row.actionType === value,
      },
      {
        key: 'resourceType',
        label: 'Resource',
        options: resourceTypes.map((value) => ({ value, label: value })),
        match: (row: AuditLogEntry, value: string) => row.resourceType === value,
      },
      {
        key: 'status',
        label: 'Result',
        options: [
          { value: 'success', label: 'Success' },
          { value: 'failed', label: 'Failed' },
        ],
        match: (row: AuditLogEntry, value: string) => row.status === value,
      },
      {
        key: 'range',
        label: 'Period',
        options: [
          { value: '1', label: 'Last 24 hours' },
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
        ],
        match: (row: AuditLogEntry, value: string) =>
          Math.abs(differenceInCalendarDays(new Date(row.timestamp), new Date())) <= Number(value),
      },
    ],
    [resourceTypes],
  );

  const table = useTableState<AuditLogEntry>({
    rows: auditLog,
    searchOn: (row) => [row.id, row.adminUser, row.resourceId, row.resourceType, row.details, row.ipAddress],
    filters,
    sortAccessors: { timestamp: (row) => row.timestamp, adminUser: (row) => row.adminUser },
    initialSort: { key: 'timestamp', direction: 'desc' },
    initialPageSize: 25,
  });

  const columns: Array<Column<AuditLogEntry>> = [
    {
      key: 'timestamp',
      header: 'When',
      sortable: true,
      hideOnCard: true,
      render: (row) => (
        <div>
          <div className="cell-strong">{formatDateTime(row.timestamp)}</div>
          <div className="dim">{formatRelative(row.timestamp)}</div>
        </div>
      ),
    },
    {
      key: 'adminUser',
      header: 'Admin',
      sortable: true,
      render: (row) => (
        <span className="row">
          <Avatar name={row.adminUser} size="sm" />
          {row.adminUser}
        </span>
      ),
    },
    {
      key: 'actionType',
      header: 'Action',
      render: (row) => <Badge tone={ACTION_TONES[row.actionType]}>{titleCase(row.actionType)}</Badge>,
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (row) => (
        <div>
          <div className="cell-strong">{row.resourceType}</div>
          <div className="dim mono">{row.resourceId}</div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (row) => (
        <span className="truncate" style={{ display: 'block', maxWidth: '24rem' }}>
          {row.details}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Result',
      render: (row) => (
        <Badge tone={row.status === 'success' ? 'success' : 'danger'}>{titleCase(row.status)}</Badge>
      ),
    },
    { key: 'ipAddress', header: 'IP', render: (row) => <span className="mono">{row.ipAddress}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${auditLog.length} recorded actions. Every change made in this console appears here, newest first.`}
      />

      <section className="card">
        <FilterBar
          query={table.query}
          onQueryChange={table.setQuery}
          placeholder="Search by admin, resource ID or description…"
          controls={filters}
          values={table.filterValues}
          onFilterChange={table.setFilter}
          chips={table.activeChips}
          onClearAll={table.clearFilters}
        />

        <DataTable
          caption="Administrative activity log"
          columns={columns}
          rows={table.rows}
          rowKey={(row) => row.id}
          sort={table.sort}
          onSort={table.toggleSort}
          onRowClick={setViewing}
          actions={(row) => (
            <button type="button" className="icon-btn" aria-label={`Inspect ${row.id}`} onClick={() => setViewing(row)}>
              <Eye size={15} />
            </button>
          )}
          cardTitle={(row) => `${titleCase(row.actionType)} · ${row.resourceType}`}
          cardActions={(row) => (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(row)}>
              Inspect
            </button>
          )}
          emptyTitle="No log entries match"
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

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${titleCase(viewing.actionType)} · ${viewing.resourceType}` : ''}
        description={viewing ? formatDateTime(viewing.timestamp) : undefined}
        footer={
          <button type="button" className="btn btn-secondary" onClick={() => setViewing(null)}>
            Close
          </button>
        }
      >
        {viewing ? (
          <div className="stack">
            <p>{viewing.details}</p>

            <dl className="dl dl-2">
              <div>
                <dt>Log ID</dt>
                <dd className="mono">{viewing.id}</dd>
              </div>
              <div>
                <dt>Admin</dt>
                <dd>{viewing.adminUser}</dd>
              </div>
              <div>
                <dt>Resource</dt>
                <dd className="mono">
                  {viewing.resourceType} · {viewing.resourceId}
                </dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>
                  <Badge tone={viewing.status === 'success' ? 'success' : 'danger'}>
                    {titleCase(viewing.status)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>IP address</dt>
                <dd className="mono">{viewing.ipAddress}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{formatRelative(viewing.timestamp)}</dd>
              </div>
            </dl>

            {viewing.before || viewing.after ? (
              <div>
                <h3 className="section-label">Change</h3>
                <div className="diff">
                  <div className="diff-box diff-before">
                    <header>Before</header>
                    <span className="mono">{viewing.before ?? '—'}</span>
                  </div>
                  <div className="diff-box diff-after">
                    <header>After</header>
                    <span className="mono">{viewing.after ?? '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="note">No field-level diff was captured for this action.</p>
            )}

            {viewing.status === 'failed' ? (
              <p className="note note-danger">
                The request was rejected upstream. Nothing was written — retry once the provider responds.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
