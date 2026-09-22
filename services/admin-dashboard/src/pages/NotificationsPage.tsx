import { useMemo, useState } from 'react';
import { Eye, FileText, Send } from 'lucide-react';
import type { AppNotification, NotificationStatus, SmsTemplate } from '../types';
import { NOTIFICATION_TYPES } from '../constants';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { Badge } from '../components/ui/Badge';
import { NotificationStatusBadge } from '../components/ui/StatusBadge';
import { formatDateTime, formatPercent, titleCase } from '../utils/format';

const STATUSES: NotificationStatus[] = ['sent', 'scheduled', 'failed', 'bounced'];

export default function NotificationsPage() {
  const notifications = useStore((state) => state.notifications);
  const templates = useStore((state) => state.templates);
  const resendNotification = useStore((state) => state.resendNotification);
  const saveTemplate = useStore((state) => state.saveTemplate);
  const pushToast = useStore((state) => state.pushToast);

  const [viewing, setViewing] = useState<AppNotification | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [draft, setDraft] = useState<SmsTemplate | null>(templates[0] ?? null);

  const stats = useMemo(() => {
    const delivered = notifications.filter((item) => item.deliveryStatus === 'delivered').length;
    return {
      total: notifications.length,
      delivered,
      failed: notifications.filter((item) => item.status === 'failed' || item.status === 'bounced').length,
      scheduled: notifications.filter((item) => item.status === 'scheduled').length,
      rate: (delivered / Math.max(1, notifications.length)) * 100,
    };
  }, [notifications]);

  const filters = useMemo(
    () => [
      {
        key: 'type',
        label: 'Type',
        options: NOTIFICATION_TYPES.map((value) => ({ value, label: value })),
        match: (row: AppNotification, value: string) => row.type === value,
      },
      {
        key: 'status',
        label: 'Status',
        options: STATUSES.map((value) => ({ value, label: titleCase(value) })),
        match: (row: AppNotification, value: string) => row.status === value,
      },
      {
        key: 'channel',
        label: 'Channel',
        options: [
          { value: 'sms', label: 'SMS' },
          { value: 'push', label: 'Push' },
        ],
        match: (row: AppNotification, value: string) => row.channel === value,
      },
    ],
    [],
  );

  const table = useTableState<AppNotification>({
    rows: notifications,
    searchOn: (row) => [row.id, row.recipientName, row.recipientPhone, row.type, row.content],
    filters,
    sortAccessors: {
      sentTime: (row) => row.sentTime ?? row.scheduledTime ?? '',
      recipientName: (row) => row.recipientName,
    },
    initialSort: { key: 'sentTime', direction: 'desc' },
  });

  const columns: Array<Column<AppNotification>> = [
    {
      key: 'recipientName',
      header: 'Recipient',
      sortable: true,
      hideOnCard: true,
      render: (row) => (
        <div>
          <div className="cell-strong truncate">{row.recipientName}</div>
          <div className="dim mono">{row.recipientPhone}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <div>
          <div className="cell-strong nowrap">{row.type}</div>
          <div className="dim">{row.channel.toUpperCase()}</div>
        </div>
      ),
    },
    {
      key: 'content',
      header: 'Message',
      render: (row) => (
        <span className="truncate" style={{ display: 'block', maxWidth: '20rem' }}>
          {row.content}
        </span>
      ),
    },
    {
      key: 'sentTime',
      header: 'Sent / scheduled',
      sortable: true,
      render: (row) =>
        row.sentTime
          ? formatDateTime(row.sentTime)
          : row.scheduledTime
            ? `Scheduled ${formatDateTime(row.scheduledTime)}`
            : '—',
    },
    { key: 'status', header: 'Status', render: (row) => <NotificationStatusBadge status={row.status} /> },
    {
      key: 'deliveryStatus',
      header: 'Delivery',
      render: (row) => (
        <Badge
          tone={
            row.deliveryStatus === 'delivered'
              ? 'success'
              : row.deliveryStatus === 'pending'
                ? 'info'
                : 'danger'
          }
        >
          {titleCase(row.deliveryStatus)}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${stats.total} messages in the log · ${formatPercent(stats.rate, 1)} delivered · ${stats.failed} failed · ${stats.scheduled} scheduled`}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => setTemplatesOpen(true)}>
            <FileText size={16} /> SMS templates
          </button>
        }
      />

      <section className="card">
          <FilterBar
            query={table.query}
            onQueryChange={table.setQuery}
            placeholder="Search by recipient, phone or message…"
            controls={filters}
            values={table.filterValues}
            onFilterChange={table.setFilter}
            chips={table.activeChips}
            onClearAll={table.clearFilters}
          />

          <DataTable
            caption="Sent and scheduled notifications"
            columns={columns}
            rows={table.rows}
            rowKey={(row) => row.id}
            sort={table.sort}
            onSort={table.toggleSort}
            actions={(row) => (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`View ${row.id}`}
                  onClick={() => setViewing(row)}
                >
                  <Eye size={15} />
                </button>
                {row.status !== 'sent' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => resendNotification(row.id)}
                  >
                    Resend
                  </button>
                ) : null}
              </>
            )}
            cardTitle={(row) => `${row.recipientName} · ${row.type}`}
            cardActions={(row) => (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(row)}>
                View log
              </button>
            )}
            emptyTitle="No notifications match"
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
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="SMS templates"
        description="Placeholders are filled in from the booking when the message is queued."
        size="lg"
      >
        <div className="stack">
              <Field label="Template">
                <select
                  className="select"
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    setDraft(templates.find((item) => item.id === event.target.value) ?? null);
                  }}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>

              {draft ? (
                <>
                  <Field label="Template name">
                    <input
                      className="input"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </Field>

                  <Field
                    label="Message body"
                    hint="Placeholders: {businessName} {date} {time} {code} {window} {expiry}"
                  >
                    <textarea
                      className="textarea"
                      style={{ minHeight: '8rem' }}
                      value={draft.body}
                      onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                    />
                  </Field>

                  <div>
                    <h3 className="section-label">Preview</h3>
                    <p className="note">
                      {draft.body
                        .replace('{businessName}', 'Elegance Hair Studio')
                        .replace('{date}', '12 Sep')
                        .replace('{time}', '16:30')
                        .replace('{code}', '482913')
                        .replace('{window}', '2')
                        .replace('{expiry}', '15')}
                    </p>
                    <p className="hint">{draft.body.length} characters · 1 SMS segment up to 160.</p>
                  </div>

                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => pushToast('info', 'Test message queued', 'Sent to the admin handset')}
                    >
                      <Send size={15} /> Send test
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => saveTemplate(draft)}>
                      Save template
                    </button>
                  </div>
                </>
              ) : null}
        </div>
      </Modal>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.type} · ${viewing.recipientName}` : ''}
        description={viewing?.recipientPhone}
        footer={
          viewing ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  resendNotification(viewing.id);
                  setViewing(null);
                }}
              >
                Resend now
              </button>
            </>
          ) : null
        }
      >
        {viewing ? (
          <div className="stack">
            <div className="note">{viewing.content}</div>

            <dl className="dl dl-2">
              <div>
                <dt>Status</dt>
                <dd>
                  <NotificationStatusBadge status={viewing.status} />
                </dd>
              </div>
              <div>
                <dt>Channel</dt>
                <dd>{viewing.channel.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Sent</dt>
                <dd>{viewing.sentTime ? formatDateTime(viewing.sentTime) : 'Not yet sent'}</dd>
              </div>
              <div>
                <dt>Scheduled</dt>
                <dd>{viewing.scheduledTime ? formatDateTime(viewing.scheduledTime) : '—'}</dd>
              </div>
            </dl>

            <div>
              <h3 className="section-label">Delivery log</h3>
              <div className="hours-grid">
                {viewing.attempts.map((attempt, index) => (
                  <div className="hours-row" key={`${attempt.at}-${index}`}>
                    <span className="day" style={{ textTransform: 'none' }}>
                      {attempt.detail}
                    </span>
                    <span className="time">{formatDateTime(attempt.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
