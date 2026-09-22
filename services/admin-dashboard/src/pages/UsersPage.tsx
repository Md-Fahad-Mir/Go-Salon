import { useMemo, useState } from 'react';
import { Ban, CircleCheck, Eye, KeyRound, Pencil, Trash2 } from 'lucide-react';
import type { AccountStatus, SubscriptionTier, User, UserType } from '../types';
import { TIER_LABELS, USER_TYPE_LABELS } from '../constants';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SidePanel } from '../components/ui/SidePanel';
import { Field } from '../components/ui/Field';
import { Toggle } from '../components/ui/Toggle';
import { Avatar } from '../components/ui/Avatar';
import { AccountStatusBadge, TierBadge } from '../components/ui/StatusBadge';
import { RowMenu } from '../components/ui/RowMenu';
import { formatDate, formatNumber, formatRating } from '../utils/format';

interface EditState {
  name: string;
  phone: string;
  email: string;
  userType: UserType;
  subscriptionTier: SubscriptionTier;
  status: AccountStatus;
  phoneVerified: boolean;
}

const PHONE_PATTERN = /^\+8801[3-9]\d{8}$/;

export default function UsersPage() {
  const users = useStore((state) => state.users);
  const updateUser = useStore((state) => state.updateUser);
  const setUserStatus = useStore((state) => state.setUserStatus);
  const deleteUser = useStore((state) => state.deleteUser);
  const pushToast = useStore((state) => state.pushToast);

  const [viewing, setViewing] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [draft, setDraft] = useState<EditState | null>(null);
  const [touched, setTouched] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);

  const filters = useMemo(
    () => [
      {
        key: 'userType',
        label: 'Type',
        options: (Object.keys(USER_TYPE_LABELS) as UserType[]).map((value) => ({
          value,
          label: USER_TYPE_LABELS[value],
        })),
        match: (row: User, value: string) => row.userType === value,
      },
      {
        key: 'tier',
        label: 'Plan',
        options: (Object.keys(TIER_LABELS) as SubscriptionTier[]).map((value) => ({
          value,
          label: TIER_LABELS[value],
        })),
        match: (row: User, value: string) => row.subscriptionTier === value,
      },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'suspended', label: 'Suspended' },
        ],
        match: (row: User, value: string) => row.status === value,
      },
    ],
    [],
  );

  const table = useTableState<User>({
    rows: users,
    searchOn: (row) => [row.id, row.name, row.phone, row.email, row.location?.area],
    filters,
    sortAccessors: {
      name: (row) => row.name,
      registrationDate: (row) => row.registrationDate,
      totalBookings: (row) => row.totalBookings,
    },
    initialSort: { key: 'registrationDate', direction: 'desc' },
    initialPageSize: 10,
  });

  const openEdit = (user: User) => {
    setEditing(user);
    setTouched(false);
    setDraft({
      name: user.name,
      phone: user.phone,
      email: user.email ?? '',
      userType: user.userType,
      subscriptionTier: user.subscriptionTier,
      status: user.status,
      phoneVerified: user.phoneVerified,
    });
  };

  const phoneError =
    touched && draft && !PHONE_PATTERN.test(draft.phone)
      ? 'Use a Bangladeshi mobile number, e.g. +8801711002233'
      : undefined;
  const nameError = touched && draft && draft.name.trim().length < 2 ? 'A name is required' : undefined;
  const canSave = Boolean(draft && PHONE_PATTERN.test(draft.phone) && draft.name.trim().length > 1);

  const columns: Array<Column<User>> = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      hideOnCard: true,
      render: (row) => (
        <div className="row">
          <Avatar name={row.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <div className="cell-strong truncate">{row.name}</div>
            <div className="dim mono">{row.id}</div>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (row) => <span className="mono">{row.phone}</span> },
    { key: 'userType', header: 'Type', render: (row) => USER_TYPE_LABELS[row.userType] },
    {
      key: 'registrationDate',
      header: 'Registered',
      sortable: true,
      render: (row) => formatDate(row.registrationDate),
    },
    { key: 'tier', header: 'Plan', render: (row) => <TierBadge tier={row.subscriptionTier} /> },
    {
      key: 'totalBookings',
      header: 'Bookings',
      sortable: true,
      align: 'end',
      render: (row) => formatNumber(row.totalBookings),
    },
    { key: 'status', header: 'Status', render: (row) => <AccountStatusBadge status={row.status} /> },
  ];

  const actions = (row: User) => (
    <>
      <button type="button" className="icon-btn" onClick={() => setViewing(row)} aria-label={`View ${row.name}`}>
        <Eye size={15} />
      </button>
      <button type="button" className="icon-btn" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
        <Pencil size={15} />
      </button>
      <RowMenu
        label={`More actions for ${row.name}`}
        items={[
          row.status === 'suspended'
            ? {
                label: 'Reactivate account',
                icon: <CircleCheck size={14} />,
                onSelect: () => setUserStatus(row.id, 'active'),
              }
            : {
                label: 'Suspend account',
                icon: <Ban size={14} />,
                onSelect: () => setUserStatus(row.id, 'suspended'),
              },
          {
            label: 'Send password reset',
            icon: <KeyRound size={14} />,
            onSelect: () => pushToast('info', 'Reset link sent', `SMS queued to ${row.phone}`),
          },
          {
            label: 'Delete account',
            icon: <Trash2 size={14} />,
            danger: true,
            separatorBefore: true,
            onSelect: () => setPendingDelete(row),
          },
        ]}
      />
    </>
  );

  const counts = useMemo(
    () => ({
      total: users.length,
      suspended: users.filter((user) => user.status === 'suspended').length,
      advanced: users.filter((user) => user.subscriptionTier === 'advanced').length,
    }),
    [users],
  );

  return (
    <>
      <PageHeader
        title="Users"
        description={`${formatNumber(counts.total)} accounts · ${counts.advanced} on Advanced · ${counts.suspended} suspended`}
      />

      <section className="card">
        <FilterBar
          query={table.query}
          onQueryChange={table.setQuery}
          placeholder="Search by name, phone, email or ID…"
          controls={filters}
          values={table.filterValues}
          onFilterChange={table.setFilter}
          chips={table.activeChips}
          onClearAll={table.clearFilters}
        />

        <DataTable
          caption="All platform users"
          columns={columns}
          rows={table.rows}
          rowKey={(row) => row.id}
          sort={table.sort}
          onSort={table.toggleSort}
          actions={actions}
          cardTitle={(row) => `${row.name} · ${row.id}`}
          cardActions={(row) => (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(row)}>
                Profile
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                Edit
              </button>
            </>
          )}
          emptyTitle="No users match"
          emptyMessage="Try a different search term or clear the filters."
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

      {/* ---- profile ---- */}
      <SidePanel
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing ? `${USER_TYPE_LABELS[viewing.userType]} · ${viewing.id}` : undefined}
        footer={
          viewing ? (
            <>
              <button
                type="button"
                className={viewing.status === 'suspended' ? 'btn btn-secondary' : 'btn btn-danger'}
                onClick={() => {
                  setUserStatus(viewing.id, viewing.status === 'suspended' ? 'active' : 'suspended');
                  setViewing(null);
                }}
              >
                {viewing.status === 'suspended' ? 'Reactivate' : 'Suspend account'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  openEdit(viewing);
                  setViewing(null);
                }}
              >
                Edit profile
              </button>
            </>
          ) : null
        }
      >
        {viewing ? (
          <div className="stack">
            <div className="row">
              <Avatar name={viewing.name} size="lg" />
              <div>
                <p className="strong" style={{ fontSize: '1rem' }}>
                  {viewing.name}
                </p>
                <div className="row" style={{ marginTop: '0.25rem' }}>
                  <AccountStatusBadge status={viewing.status} />
                  <TierBadge tier={viewing.subscriptionTier} />
                </div>
              </div>
            </div>

            <dl className="dl dl-2">
              <div>
                <dt>Phone</dt>
                <dd className="mono">
                  {viewing.phone} {viewing.phoneVerified ? '· verified' : '· unverified'}
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{viewing.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{formatDate(viewing.registrationDate)}</dd>
              </div>
              <div>
                <dt>Total bookings</dt>
                <dd>{formatNumber(viewing.totalBookings)}</dd>
              </div>
              <div>
                <dt>AI generations used</dt>
                <dd>{formatNumber(viewing.generationsUsed)}</dd>
              </div>
              <div>
                <dt>Average rating</dt>
                <dd>{viewing.averageRating ? `${formatRating(viewing.averageRating)} / 5` : 'n/a'}</dd>
              </div>
            </dl>

            {viewing.location ? (
              <div>
                <h3 className="section-label">Address</h3>
                <p>{viewing.location.address}</p>
                <p className="dim mono" style={{ fontSize: '0.75rem' }}>
                  {viewing.location.lat}, {viewing.location.lng}
                </p>
              </div>
            ) : null}

            {viewing.hairType ? (
              <div>
                <h3 className="section-label">Hair profile</h3>
                <dl className="dl dl-2">
                  <div>
                    <dt>Hair type</dt>
                    <dd>{viewing.hairType}</dd>
                  </div>
                  <div>
                    <dt>Preferred length</dt>
                    <dd>{viewing.preferredLength}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        ) : null}
      </SidePanel>

      {/* ---- edit ---- */}
      <Modal
        open={editing !== null && draft !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? 'user'}`}
        description="Changes take effect immediately and are written to the audit log."
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={touched && !canSave}
              onClick={() => {
                setTouched(true);
                if (!canSave || !editing || !draft) return;
                updateUser(editing.id, {
                  name: draft.name.trim(),
                  phone: draft.phone.trim(),
                  email: draft.email.trim() || undefined,
                  userType: draft.userType,
                  subscriptionTier: draft.subscriptionTier,
                  status: draft.status,
                  phoneVerified: draft.phoneVerified,
                });
                setEditing(null);
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        {draft ? (
          <div className="form-grid form-grid-2">
            <Field label="Full name" required error={nameError}>
              <input
                className="input"
                value={draft.name}
                onBlur={() => setTouched(true)}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>

            <Field label="Phone" required error={phoneError}>
              <input
                className="input"
                inputMode="tel"
                value={draft.phone}
                onBlur={() => setTouched(true)}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              />
            </Field>

            <Field label="Email" hint="Optional — used for receipts only.">
              <input
                className="input"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
            </Field>

            <Field label="User type">
              <select
                className="select"
                value={draft.userType}
                onChange={(event) => setDraft({ ...draft, userType: event.target.value as UserType })}
              >
                {(Object.keys(USER_TYPE_LABELS) as UserType[]).map((type) => (
                  <option key={type} value={type}>
                    {USER_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subscription">
              <select
                className="select"
                value={draft.subscriptionTier}
                onChange={(event) =>
                  setDraft({ ...draft, subscriptionTier: event.target.value as SubscriptionTier })
                }
              >
                {(Object.keys(TIER_LABELS) as SubscriptionTier[]).map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_LABELS[tier]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Account status">
              <select
                className="select"
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as AccountStatus })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>

            <Toggle
              checked={draft.phoneVerified}
              onChange={(phoneVerified) => setDraft({ ...draft, phoneVerified })}
              label="Phone verified by OTP"
            />

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => pushToast('info', 'Reset link sent', `SMS queued to ${draft.phone}`)}
            >
              <KeyRound size={15} /> Send password reset
            </button>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this account?"
        message={`${pendingDelete?.name}'s account, bookings history and saved try-ons will be removed. This cannot be undone.`}
        confirmLabel="Delete account"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteUser(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
