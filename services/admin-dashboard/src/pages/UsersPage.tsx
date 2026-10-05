import { useMemo, useState } from 'react';
import { Ban, CircleCheck, Eye, KeyRound, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { AccountStatus, SubscriptionTier, User, UserBusiness, UserType } from '../types';
import {
  ACCOUNT_TYPE_FILTERS,
  ACCOUNT_TYPE_LABELS,
  AUDIENCE_LABELS,
  TIER_LABELS,
  USER_TYPE_LABELS,
} from '../constants';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTableState } from '../hooks/useTableState';
import { useAsyncList } from '../hooks/useAsyncList';
import { userService } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SidePanel } from '../components/ui/SidePanel';
import { EmptyState } from '../components/ui/EmptyState';
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

/** What kind of place this is, in the words an admin would use. */
const businessKind = (business: UserBusiness): string => {
  if (business.audience === 'women') return 'Parlour';
  return business.businessType === 'barber' ? 'Barbershop' : 'Salon';
};

/** Street address plus area and city — each only when the owner didn't
    already type it into the street line, which most do. */
const businessAddress = ({ location }: UserBusiness): string => {
  const street = location.address.trim();
  const extra = [location.area, location.city].filter(
    (part) => part && !street.toLowerCase().includes(part.toLowerCase()),
  );
  return [street, ...extra].filter(Boolean).join(', ') || '—';
};

function BusinessDetails({ business, title }: { business: UserBusiness; title?: string }) {
  return (
    <dl className="dl dl-2">
      <div>
        <dt>Name</dt>
        <dd>{business.name}</dd>
      </div>
      <div>
        <dt>Kind</dt>
        <dd>
          {businessKind(business)} · serves {AUDIENCE_LABELS[business.audience].toLowerCase()}
        </dd>
      </div>
      {title !== undefined ? (
        <div>
          <dt>Job title</dt>
          <dd>{title || '—'}</dd>
        </div>
      ) : null}
      <div>
        <dt>Address</dt>
        <dd>{businessAddress(business)}</dd>
      </div>
    </dl>
  );
}

export default function UsersPage() {
  const pushToast = useStore((state) => state.pushToast);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data: users, loading, error, refetch } = useAsyncList(() => userService.list());

  const [viewing, setViewing] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [draft, setDraft] = useState<EditState | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filters = useMemo(
    () => [
      {
        key: 'accountType',
        label: 'Type',
        options: ACCOUNT_TYPE_FILTERS.map((value) => ({
          value,
          label: ACCOUNT_TYPE_LABELS[value],
        })),
        match: (row: User, value: string) => row.accountType === value,
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
    searchOn: (row) => [
      row.id,
      row.name,
      row.phone,
      row.email,
      row.location?.area,
      ...(row.salons ?? []).map((salon) => salon.name),
      row.employment?.salon.name,
    ],
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

  const setStatus = async (user: User, status: AccountStatus) => {
    try {
      await userService.update(user.id, { status });
      pushToast(
        status === 'suspended' ? 'warning' : 'success',
        `Account ${status}`,
        user.name,
      );
      refetch();
    } catch (err) {
      pushToast('error', 'Could not update status', err instanceof ApiError ? err.message : 'Try again.');
    }
  };

  const sendPasswordReset = async (user: User) => {
    try {
      await userService.sendPasswordReset(user.phone);
      pushToast('info', 'Reset code sent', `SMS queued to ${user.phone}`);
    } catch (err) {
      pushToast('error', 'Could not send reset code', err instanceof ApiError ? err.message : 'Try again.');
    }
  };

  const phoneError =
    touched && draft && !PHONE_PATTERN.test(draft.phone)
      ? 'Use a Bangladeshi mobile number, e.g. +8801711002233'
      : undefined;
  const nameError = touched && draft && draft.name.trim().length < 2 ? 'A name is required' : undefined;
  const canSave = Boolean(draft && PHONE_PATTERN.test(draft.phone) && draft.name.trim().length > 1);

  const saveEdit = async () => {
    setTouched(true);
    if (!canSave || !editing || !draft) return;
    setSaving(true);
    try {
      await userService.update(editing.id, {
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim() || undefined,
        userType: draft.userType,
        subscriptionTier: draft.subscriptionTier,
        status: draft.status,
        phoneVerified: draft.phoneVerified,
      });
      pushToast('success', 'User updated', draft.name);
      setEditing(null);
      refetch();
    } catch (err) {
      pushToast('error', 'Could not save', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await userService.remove(pendingDelete.id);
      pushToast('success', 'User deleted', pendingDelete.name);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      pushToast('error', 'Could not delete', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setDeleting(false);
    }
  };

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
    { key: 'accountType', header: 'Type', render: (row) => ACCOUNT_TYPE_LABELS[row.accountType] },
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

  const actions = (row: User) => {
    const isSelf = currentUserId !== undefined && row.id === String(currentUserId);
    return (
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
          // Suspending or deleting your own account locks you out of the
          // session making the request — see Apps/users/views.py
          // AdminUserDetailView.patch/delete for the matching server-side
          // refusal. Hidden here rather than left to fail after the click.
          ...(isSelf
            ? []
            : [
                row.status === 'suspended'
                  ? {
                      label: 'Reactivate account',
                      icon: <CircleCheck size={14} />,
                      onSelect: () => setStatus(row, 'active'),
                    }
                  : {
                      label: 'Suspend account',
                      icon: <Ban size={14} />,
                      onSelect: () => setStatus(row, 'suspended'),
                    },
              ]),
          {
            label: 'Send password reset',
            icon: <KeyRound size={14} />,
            onSelect: () => sendPasswordReset(row),
          },
          ...(isSelf
            ? []
            : [
                {
                  label: 'Delete account',
                  icon: <Trash2 size={14} />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => setPendingDelete(row),
                },
              ]),
        ]}
      />
    </>
    );
  };

  return (
    <>
      <PageHeader title="Users" />

      <section className="card">
        {error ? (
          <EmptyState
            title="Couldn't load users"
            message={error}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={refetch}>
                <RefreshCw size={14} /> Retry
              </button>
            }
          />
        ) : (
          <>
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
              onRowClick={setViewing}
              loading={loading}
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
          </>
        )}
      </section>

      {/* ---- profile ---- */}
      <SidePanel
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing ? `${ACCOUNT_TYPE_LABELS[viewing.accountType]} · ${viewing.id}` : undefined}
        footer={
          viewing ? (
            <>
              {currentUserId !== undefined && viewing.id === String(currentUserId) ? null : (
                <button
                  type="button"
                  className={viewing.status === 'suspended' ? 'btn btn-secondary' : 'btn btn-danger'}
                  onClick={() => {
                    setStatus(viewing, viewing.status === 'suspended' ? 'active' : 'suspended');
                    setViewing(null);
                  }}
                >
                  {viewing.status === 'suspended' ? 'Reactivate' : 'Suspend account'}
                </button>
              )}
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

            {viewing.userType === 'salon' ? (
              <div>
                <h3 className="section-label">
                  {(viewing.salons ?? []).length > 1 ? 'Businesses' : 'Business'}
                </h3>
                {viewing.salons?.length ? (
                  <div className="stack-sm">
                    {viewing.salons.map((salon) => (
                      <BusinessDetails key={salon.id} business={salon} />
                    ))}
                  </div>
                ) : (
                  <p className="muted">No salon or parlour registered yet.</p>
                )}
              </div>
            ) : null}

            {viewing.userType === 'employee' ? (
              <div>
                <h3 className="section-label">Workplace</h3>
                {viewing.employment ? (
                  <BusinessDetails business={viewing.employment.salon} title={viewing.employment.title} />
                ) : (
                  <p className="muted">Not currently working at a salon or parlour.</p>
                )}
              </div>
            ) : null}

            {viewing.location ? (
              <div>
                <h3 className="section-label">Address</h3>
                <p>{viewing.location.address}</p>
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
              disabled={saving || (touched && !canSave)}
              onClick={saveEdit}
            >
              {saving ? 'Saving…' : 'Save changes'}
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
              onClick={() => editing && sendPasswordReset(editing)}
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
        confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
