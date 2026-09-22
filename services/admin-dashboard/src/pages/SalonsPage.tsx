import { useMemo, useState } from 'react';
import { Check, Eye, MapPin, Pencil, Phone, Plus, Star, Trash2, X } from 'lucide-react';
import type { Salon, Service, StaffMember, TargetAudience, VerificationStatus } from '../types';
import { WEEKDAYS } from '../constants';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import type { Column } from '../components/ui/DataTable';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { Pagination } from '../components/ui/Pagination';
import { PageHeader } from '../components/ui/PageHeader';
import { SidePanel } from '../components/ui/SidePanel';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { Toggle } from '../components/ui/Toggle';
import { Avatar } from '../components/ui/Avatar';
import { EntityStatusBadge, VerificationBadge } from '../components/ui/StatusBadge';
import { Badge } from '../components/ui/Badge';
import { RowMenu } from '../components/ui/RowMenu';
import { formatBdt, formatDate, formatDuration, formatRating, titleCase } from '../utils/format';
import { nextId } from '../utils/id';

type PanelTab = 'profile' | 'staff' | 'services';

const emptyStaff = (salonId: string): StaffMember => ({
  id: nextId('STF'),
  salonId,
  name: '',
  phone: '',
  roleTitle: 'Senior stylist',
  specialties: [],
  experienceYears: '2–5 yrs',
  customHours: false,
  status: 'active',
  rating: 0,
  bio: '',
});

const emptyService = (businessId: string): Service => ({
  id: nextId('SVC'),
  businessId,
  name: '',
  category: 'Haircut',
  price: 500,
  duration: 30,
  targetAudience: 'all',
  eligibility: 'all',
  eligibleStaffIds: [],
  description: '',
  status: 'active',
});

export default function SalonsPage() {
  const salons = useStore((state) => state.salons);
  const staff = useStore((state) => state.staff);
  const services = useStore((state) => state.services);
  const setVerification = useStore((state) => state.setVerification);
  const updateSalon = useStore((state) => state.updateSalon);
  const upsertStaff = useStore((state) => state.upsertStaff);
  const removeStaff = useStore((state) => state.removeStaff);
  const upsertService = useStore((state) => state.upsertService);
  const removeService = useStore((state) => state.removeService);

  const [viewing, setViewing] = useState<Salon | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('profile');
  const [staffDraft, setStaffDraft] = useState<StaffMember | null>(null);
  const [serviceDraft, setServiceDraft] = useState<Service | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ kind: 'staff' | 'service'; id: string; name: string } | null>(
    null,
  );

  const pending = useMemo(
    () => salons.filter((salon) => salon.verificationStatus === 'pending'),
    [salons],
  );

  const filters = useMemo(
    () => [
      {
        key: 'verification',
        label: 'Verification',
        options: [
          { value: 'verified', label: 'Verified' },
          { value: 'pending', label: 'Pending' },
          { value: 'rejected', label: 'Rejected' },
        ],
        match: (row: Salon, value: string) => row.verificationStatus === value,
      },
      {
        key: 'type',
        label: 'Type',
        options: [
          { value: 'salon', label: 'Salon' },
          { value: 'barber', label: 'Barbershop' },
        ],
        match: (row: Salon, value: string) => row.businessType === value,
      },
      {
        key: 'area',
        label: 'Area',
        options: [...new Set(salons.map((salon) => salon.location.area))].map((area) => ({
          value: area,
          label: area,
        })),
        match: (row: Salon, value: string) => row.location.area === value,
      },
    ],
    [salons],
  );

  const table = useTableState<Salon>({
    rows: salons,
    searchOn: (row) => [row.id, row.name, row.ownerName, row.phone, row.location.area],
    filters,
    sortAccessors: {
      name: (row) => row.name,
      rating: (row) => row.rating,
      activeStaffCount: (row) => row.activeStaffCount,
      monthlyRevenue: (row) => row.monthlyRevenue,
    },
    initialSort: { key: 'name', direction: 'asc' },
  });

  const panelStaff = viewing ? staff.filter((member) => member.salonId === viewing.id) : [];
  const panelServices = viewing ? services.filter((service) => service.businessId === viewing.id) : [];

  const decide = (salon: Salon, status: VerificationStatus) => setVerification(salon.id, status);

  const columns: Array<Column<Salon>> = [
    {
      key: 'name',
      header: 'Business',
      sortable: true,
      hideOnCard: true,
      render: (row) => (
        <div className="row">
          <Avatar name={row.name} size="sm" accent={row.businessType === 'barber'} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-strong truncate">{row.name}</div>
            <div className="dim mono">
              {row.id} · {titleCase(row.businessType)}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'ownerName', header: 'Owner', render: (row) => row.ownerName },
    { key: 'phone', header: 'Phone', render: (row) => <span className="mono">{row.phone}</span> },
    { key: 'area', header: 'Area', render: (row) => row.location.area },
    {
      key: 'verification',
      header: 'Verification',
      render: (row) => <VerificationBadge status={row.verificationStatus} />,
    },
    {
      key: 'activeStaffCount',
      header: 'Staff',
      sortable: true,
      align: 'end',
      render: (row) => row.activeStaffCount,
    },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      align: 'end',
      render: (row) => (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          <Star size={12} fill="var(--accent)" color="var(--accent)" />
          {formatRating(row.rating)}
        </span>
      ),
    },
    { key: 'totalServices', header: 'Services', align: 'end', render: (row) => row.totalServices },
    { key: 'status', header: 'Status', render: (row) => <EntityStatusBadge status={row.status} /> },
  ];

  const actions = (row: Salon) => (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={`View ${row.name}`}
        onClick={() => {
          setViewing(row);
          setPanelTab('profile');
        }}
      >
        <Eye size={15} />
      </button>
      <RowMenu
        label={`More actions for ${row.name}`}
        items={[
          {
            label: 'Manage staff',
            onSelect: () => {
              setViewing(row);
              setPanelTab('staff');
            },
          },
          {
            label: 'Manage services',
            onSelect: () => {
              setViewing(row);
              setPanelTab('services');
            },
          },
          {
            label: row.verificationStatus === 'verified' ? 'Revoke verification' : 'Verify business',
            separatorBefore: true,
            onSelect: () => decide(row, row.verificationStatus === 'verified' ? 'pending' : 'verified'),
          },
          {
            label: row.status === 'active' ? 'Deactivate business' : 'Reactivate business',
            danger: row.status === 'active',
            onSelect: () => updateSalon(row.id, { status: row.status === 'active' ? 'inactive' : 'active' }),
          },
        ]}
      />
    </>
  );

  return (
    <>
      <PageHeader
        title="Salons & barbers"
        description={`${salons.length} businesses on the platform · ${pending.length} awaiting approval`}
      />

      {pending.length ? (
        <section aria-labelledby="approvals-heading" style={{ marginBottom: '1rem' }}>
          <h2 id="approvals-heading" className="section-label" style={{ marginTop: 0 }}>
            Awaiting approval
          </h2>
          <div className="settings-grid">
            {pending.slice(0, 4).map((salon) => (
              <article className="card card-pad" key={salon.id}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div className="row">
                    <Avatar name={salon.name} />
                    <div style={{ minWidth: 0 }}>
                      <p className="strong truncate">{salon.name}</p>
                      <p className="dim" style={{ fontSize: '0.75rem' }}>
                        {salon.ownerName} · joined {formatDate(salon.joinedDate)}
                      </p>
                    </div>
                  </div>
                  <Badge tone="warning">Pending</Badge>
                </div>

                <ul className="stack-sm" style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
                  <li className="row dim">
                    <MapPin size={14} /> {salon.location.address}
                  </li>
                  <li className="row dim">
                    <Phone size={14} /> <span className="mono">{salon.phone}</span>
                  </li>
                </ul>

                <div className="row" style={{ marginTop: '0.875rem' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(salon, 'verified')}>
                    <Check size={14} /> Approve
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide(salon, 'rejected')}>
                    <X size={14} /> Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setViewing(salon);
                      setPanelTab('profile');
                    }}
                  >
                    Review
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <FilterBar
          query={table.query}
          onQueryChange={table.setQuery}
          placeholder="Search by business, owner, phone or area…"
          controls={filters}
          values={table.filterValues}
          onFilterChange={table.setFilter}
          chips={table.activeChips}
          onClearAll={table.clearFilters}
        />

        <DataTable
          caption="Registered salons and barbershops"
          columns={columns}
          rows={table.rows}
          rowKey={(row) => row.id}
          sort={table.sort}
          onSort={table.toggleSort}
          actions={actions}
          cardTitle={(row) => `${row.name} · ${titleCase(row.businessType)}`}
          cardActions={(row) => (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setViewing(row);
                  setPanelTab('profile');
                }}
              >
                Profile
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setViewing(row);
                  setPanelTab('staff');
                }}
              >
                Staff
              </button>
            </>
          )}
          emptyTitle="No businesses match"
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

      {/* ---- business profile ---- */}
      <SidePanel
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing ? `${titleCase(viewing.businessType)} · ${viewing.location.area}` : undefined}
        footer={
          viewing ? (
            viewing.verificationStatus === 'pending' ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => decide(viewing, 'rejected')}>
                  Reject
                </button>
                <button type="button" className="btn btn-primary" onClick={() => decide(viewing, 'verified')}>
                  Approve business
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => updateSalon(viewing.id, { status: viewing.status === 'active' ? 'inactive' : 'active' })}
              >
                {viewing.status === 'active' ? 'Deactivate business' : 'Reactivate business'}
              </button>
            )
          ) : null
        }
      >
        {viewing ? (
          <div className="stack">
            <Tabs
              label="Business sections"
              active={panelTab}
              onChange={setPanelTab}
              tabs={[
                { id: 'profile', label: 'Profile' },
                { id: 'staff', label: 'Staff', count: panelStaff.length },
                { id: 'services', label: 'Services', count: panelServices.length },
              ]}
            />

            {panelTab === 'profile' ? (
              <div className="stack">
                <div className="row">
                  <VerificationBadge status={viewing.verificationStatus} />
                  <EntityStatusBadge status={viewing.status} />
                  <Badge tone="neutral" plain>
                    ★ {formatRating(viewing.rating)} · {viewing.reviewCount} reviews
                  </Badge>
                </div>

                <p>{viewing.bio}</p>

                <dl className="dl dl-2">
                  <div>
                    <dt>Owner</dt>
                    <dd>{viewing.ownerName}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd className="mono">{viewing.phone}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{viewing.email ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>{formatDate(viewing.joinedDate)}</dd>
                  </div>
                  <div>
                    <dt>Booking mode</dt>
                    <dd>{viewing.acceptanceMode === 'auto' ? 'Auto-accept' : 'Manual accept'}</dd>
                  </div>
                  <div>
                    <dt>Revenue / month</dt>
                    <dd>{formatBdt(viewing.monthlyRevenue)}</dd>
                  </div>
                </dl>

                <div>
                  <h3 className="section-label">Location</h3>
                  <p>{viewing.location.address}</p>
                  <p className="dim mono" style={{ fontSize: '0.75rem' }}>
                    {viewing.location.lat}, {viewing.location.lng}
                  </p>
                </div>

                <div>
                  <h3 className="section-label">Gallery</h3>
                  <div className="gallery">
                    {Array.from({ length: 6 }, (_, index) => (
                      <span className="thumb" key={index} aria-hidden="true">
                        <span className="thumb-art" />
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="section-label">Business hours</h3>
                  <div className="hours-grid">
                    {WEEKDAYS.map((day) => {
                      const hours = viewing.operatingHours[day];
                      return (
                        <div className="hours-row" key={day}>
                          <span className="day">{day}</span>
                          <span className="time">
                            {hours.closed ? 'Closed' : `${hours.open} – ${hours.close}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {panelTab === 'staff' ? (
              <div className="stack">
                <div className="row-between">
                  <p className="card-sub">{panelStaff.length} people on the roster</p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setStaffDraft(emptyStaff(viewing.id))}
                  >
                    <Plus size={14} /> Add staff
                  </button>
                </div>

                {panelStaff.length === 0 ? <p className="dim">No staff added yet.</p> : null}

                {panelStaff.map((member) => (
                  <article className="tc" key={member.id}>
                    <div className="row-between">
                      <div className="row">
                        <Avatar name={member.name} size="sm" />
                        <div>
                          <p className="strong">{member.name}</p>
                          <p className="dim" style={{ fontSize: '0.75rem' }}>
                            {member.roleTitle} · {member.experienceYears}
                          </p>
                        </div>
                      </div>
                      <EntityStatusBadge status={member.status} />
                    </div>
                    <div className="chips">
                      {member.specialties.map((specialty) => (
                        <Badge key={specialty} tone="neutral" plain>
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                    <p className="dim mono" style={{ fontSize: '0.75rem' }}>
                      {member.phone} · {member.customHours ? 'custom hours' : 'salon hours'}
                    </p>
                    <div className="tc-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStaffDraft(member)}>
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPendingRemoval({ kind: 'staff', id: member.id, name: member.name })}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {panelTab === 'services' ? (
              <div className="stack">
                <div className="row-between">
                  <p className="card-sub">{panelServices.length} bookable services</p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setServiceDraft(emptyService(viewing.id))}
                  >
                    <Plus size={14} /> Add service
                  </button>
                </div>

                {panelServices.map((service) => (
                  <article className="tc" key={service.id}>
                    <div className="row-between">
                      <p className="strong">{service.name}</p>
                      <span className="strong">{formatBdt(service.price)}</span>
                    </div>
                    <p className="dim" style={{ fontSize: '0.8125rem' }}>
                      {formatDuration(service.duration)} · {titleCase(service.targetAudience)} ·{' '}
                      {service.eligibility === 'all' ? 'all staff' : `${service.eligibleStaffIds.length} staff`}
                    </p>
                    <div className="row">
                      <EntityStatusBadge status={service.status} />
                      <Badge tone="neutral" plain>
                        {service.category}
                      </Badge>
                    </div>
                    <div className="tc-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setServiceDraft(service)}>
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPendingRemoval({ kind: 'service', id: service.id, name: service.name })}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </SidePanel>

      {/* ---- staff editor ---- */}
      <Modal
        open={staffDraft !== null}
        onClose={() => setStaffDraft(null)}
        title={staffDraft?.name ? `Edit ${staffDraft.name}` : 'Add staff member'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setStaffDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!staffDraft?.name.trim()}
              onClick={() => {
                if (!staffDraft) return;
                upsertStaff(staffDraft);
                setStaffDraft(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        {staffDraft ? (
          <div className="form-grid form-grid-2">
            <Field label="Name" required>
              <input
                className="input"
                value={staffDraft.name}
                onChange={(event) => setStaffDraft({ ...staffDraft, name: event.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                inputMode="tel"
                value={staffDraft.phone}
                onChange={(event) => setStaffDraft({ ...staffDraft, phone: event.target.value })}
              />
            </Field>
            <Field label="Role title">
              <input
                className="input"
                value={staffDraft.roleTitle}
                onChange={(event) => setStaffDraft({ ...staffDraft, roleTitle: event.target.value })}
              />
            </Field>
            <Field label="Experience">
              <select
                className="select"
                value={staffDraft.experienceYears}
                onChange={(event) => setStaffDraft({ ...staffDraft, experienceYears: event.target.value })}
              >
                {['0–2 yrs', '2–5 yrs', '5–10 yrs', '10+ yrs'].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="Specialties" className="form-span-2" hint="Comma separated.">
              <input
                className="input"
                value={staffDraft.specialties.join(', ')}
                onChange={(event) =>
                  setStaffDraft({
                    ...staffDraft,
                    specialties: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                  })
                }
              />
            </Field>
            <Field label="Bio" className="form-span-2">
              <textarea
                className="textarea"
                value={staffDraft.bio ?? ''}
                onChange={(event) => setStaffDraft({ ...staffDraft, bio: event.target.value })}
              />
            </Field>
            <Toggle
              checked={staffDraft.customHours}
              onChange={(customHours) => setStaffDraft({ ...staffDraft, customHours })}
              label="Uses custom working hours"
            />
            <Toggle
              checked={staffDraft.status === 'active'}
              onChange={(active) => setStaffDraft({ ...staffDraft, status: active ? 'active' : 'inactive' })}
              label="Active on the roster"
            />
          </div>
        ) : null}
      </Modal>

      {/* ---- service editor ---- */}
      <Modal
        open={serviceDraft !== null}
        onClose={() => setServiceDraft(null)}
        title={serviceDraft?.name ? `Edit ${serviceDraft.name}` : 'Add service'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setServiceDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!serviceDraft?.name.trim()}
              onClick={() => {
                if (!serviceDraft) return;
                upsertService(serviceDraft);
                setServiceDraft(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        {serviceDraft ? (
          <div className="form-grid form-grid-2">
            <Field label="Service name" required className="form-span-2">
              <input
                className="input"
                value={serviceDraft.name}
                onChange={(event) => setServiceDraft({ ...serviceDraft, name: event.target.value })}
              />
            </Field>
            <Field label="Price (৳)" required>
              <input
                className="input"
                type="number"
                min={0}
                value={serviceDraft.price}
                onChange={(event) => setServiceDraft({ ...serviceDraft, price: Number(event.target.value) })}
              />
            </Field>
            <Field label="Duration (minutes)" required>
              <input
                className="input"
                type="number"
                min={5}
                step={5}
                value={serviceDraft.duration}
                onChange={(event) => setServiceDraft({ ...serviceDraft, duration: Number(event.target.value) })}
              />
            </Field>
            <Field label="Target audience">
              <select
                className="select"
                value={serviceDraft.targetAudience}
                onChange={(event) =>
                  setServiceDraft({ ...serviceDraft, targetAudience: event.target.value as TargetAudience })
                }
              >
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Eligibility">
              <select
                className="select"
                value={serviceDraft.eligibility}
                onChange={(event) =>
                  setServiceDraft({ ...serviceDraft, eligibility: event.target.value as Service['eligibility'] })
                }
              >
                <option value="all">All staff</option>
                <option value="specific">Specific staff</option>
              </select>
            </Field>
            <Field label="Description" className="form-span-2">
              <textarea
                className="textarea"
                value={serviceDraft.description ?? ''}
                onChange={(event) => setServiceDraft({ ...serviceDraft, description: event.target.value })}
              />
            </Field>
            <Toggle
              checked={serviceDraft.status === 'active'}
              onChange={(active) => setServiceDraft({ ...serviceDraft, status: active ? 'active' : 'inactive' })}
              label="Bookable in the app"
            />
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={pendingRemoval?.kind === 'staff' ? 'Remove this staff member?' : 'Delete this service?'}
        message={`“${pendingRemoval?.name}” will no longer appear in the app. Existing bookings are unaffected.`}
        confirmLabel={pendingRemoval?.kind === 'staff' ? 'Remove' : 'Delete'}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval?.kind === 'staff') removeStaff(pendingRemoval.id);
          if (pendingRemoval?.kind === 'service') removeService(pendingRemoval.id);
          setPendingRemoval(null);
        }}
      />
    </>
  );
}
