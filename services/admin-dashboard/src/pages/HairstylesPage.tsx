import { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Hairstyle } from '../types';
import { HAIRSTYLE_CATEGORIES } from '../constants';
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
import { TagInput } from '../components/ui/TagInput';
import { Toggle } from '../components/ui/Toggle';
import { ImageUploader } from '../components/ui/ImageUploader';
import { EntityStatusBadge } from '../components/ui/StatusBadge';
import { Badge } from '../components/ui/Badge';
import { RowMenu } from '../components/ui/RowMenu';
import { formatDate, formatNumber, formatPercent } from '../utils/format';

interface FormState {
  name: string;
  category: string;
  description: string;
  image: string | undefined;
  tags: string[];
  featured: boolean;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  category: 'Haircut',
  description: '',
  image: undefined,
  tags: [],
  featured: false,
  active: true,
};

export default function HairstylesPage() {
  const hairstyles = useStore((state) => state.hairstyles);
  const addHairstyle = useStore((state) => state.addHairstyle);
  const updateHairstyle = useStore((state) => state.updateHairstyle);
  const deleteHairstyle = useStore((state) => state.deleteHairstyle);

  const [editing, setEditing] = useState<Hairstyle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [viewing, setViewing] = useState<Hairstyle | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Hairstyle | null>(null);

  const filters = useMemo(
    () => [
      {
        key: 'category',
        label: 'Category',
        options: HAIRSTYLE_CATEGORIES.map((value) => ({ value, label: value })),
        match: (row: Hairstyle, value: string) => row.category === value,
      },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'featured', label: 'Featured' },
        ],
        match: (row: Hairstyle, value: string) =>
          value === 'featured' ? row.featured : row.status === value,
      },
    ],
    [],
  );

  const table = useTableState<Hairstyle>({
    rows: hairstyles,
    searchOn: (row) => [row.id, row.name, row.category, row.tags.join(' ')],
    filters,
    sortAccessors: {
      name: (row) => row.name,
      category: (row) => row.category,
      generationCount: (row) => row.generationCount,
      successRate: (row) => row.successRate,
    },
    initialSort: { key: 'generationCount', direction: 'desc' },
  });

  const nameError = touched && !form.name.trim() ? 'A name is required' : undefined;
  const valid = form.name.trim().length > 1;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    setFormOpen(true);
  };

  const openEdit = (row: Hairstyle) => {
    setEditing(row);
    setForm({
      name: row.name,
      category: row.category,
      description: row.description ?? '',
      image: row.image,
      tags: row.tags,
      featured: row.featured,
      active: row.status === 'active',
    });
    setTouched(false);
    setFormOpen(true);
  };

  const save = () => {
    setTouched(true);
    if (!valid) return;
    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || undefined,
      image: form.image ?? '/hairstyles/placeholder.jpg',
      tags: form.tags,
      featured: form.featured,
      status: form.active ? ('active' as const) : ('inactive' as const),
    };
    if (editing) updateHairstyle(editing.id, payload);
    else addHairstyle(payload);
    setFormOpen(false);
  };

  const columns: Array<Column<Hairstyle>> = [
    {
      key: 'name',
      header: 'Hairstyle',
      sortable: true,
      hideOnCard: true,
      render: (row) => (
        <div className="row">
          <span className="thumb" aria-hidden="true">
            <span className="thumb-art" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="cell-strong truncate">{row.name}</div>
            <div className="dim mono">{row.id}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, render: (row) => row.category },
    {
      key: 'tags',
      header: 'Tags',
      render: (row) => (
        <div className="chips">
          {row.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} tone="neutral" plain>
              {tag}
            </Badge>
          ))}
          {row.tags.length > 3 ? <span className="dim">+{row.tags.length - 3}</span> : null}
        </div>
      ),
    },
    {
      key: 'generationCount',
      header: 'Generations',
      sortable: true,
      align: 'end',
      render: (row) => formatNumber(row.generationCount),
    },
    {
      key: 'successRate',
      header: 'Success',
      sortable: true,
      align: 'end',
      render: (row) => (row.successRate ? formatPercent(row.successRate) : '—'),
    },
    {
      key: 'featured',
      header: 'Featured',
      render: (row) => (
        <Toggle
          checked={row.featured}
          hideLabel
          label={`Feature ${row.name}`}
          onChange={(checked) => updateHairstyle(row.id, { featured: checked })}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="row">
          <Toggle
            checked={row.status === 'active'}
            hideLabel
            label={`Activate ${row.name}`}
            onChange={(checked) => updateHairstyle(row.id, { status: checked ? 'active' : 'inactive' })}
          />
          <EntityStatusBadge status={row.status} />
        </div>
      ),
    },
  ];

  const actions = (row: Hairstyle) => (
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
          { label: 'Delete hairstyle', icon: <Trash2 size={14} />, danger: true, onSelect: () => setPendingDelete(row) },
        ]}
      />
    </>
  );

  return (
    <>
      <PageHeader
        title="Hairstyle catalogue"
        description={`${hairstyles.length} styles power the AI try-on. Deactivating one hides it from the app immediately.`}
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add hairstyle
          </button>
        }
      />

      <section className="card">
        <FilterBar
          query={table.query}
          onQueryChange={table.setQuery}
          placeholder="Search by name, tag or ID…"
          controls={filters}
          values={table.filterValues}
          onFilterChange={table.setFilter}
          chips={table.activeChips}
          onClearAll={table.clearFilters}
        />

        <DataTable
          caption="Hairstyle catalogue"
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
                View
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                Edit
              </button>
            </>
          )}
          emptyTitle="No hairstyles match"
          emptyMessage="Clear the filters or add a new style to the catalogue."
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add hairstyle'}
        description="Styles appear in the app try-on picker as soon as they are active."
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!valid && touched}>
              {editing ? 'Save changes' : 'Save hairstyle'}
            </button>
          </>
        }
      >
        <div className="form-grid form-grid-2">
          <Field label="Name" required error={nameError}>
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Textured crop"
            />
          </Field>

          <Field label="Category" required>
            <select
              className="select"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {HAIRSTYLE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Description" className="form-span-2" hint="Shown under the style in the app.">
            <textarea
              className="textarea"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Short reference note for the generator"
            />
          </Field>

          <Field label="Primary image" className="form-span-2">
            <div>
              <ImageUploader value={form.image} onChange={(image) => setForm({ ...form, image })} />
            </div>
          </Field>

          <Field label="Tags" className="form-span-2" hint="Press Enter or type a comma to add each tag.">
            <div>
              <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
            </div>
          </Field>

          <Toggle
            checked={form.featured}
            onChange={(featured) => setForm({ ...form, featured })}
            label="Feature on the app home screen"
          />
          <Toggle
            checked={form.active}
            onChange={(active) => setForm({ ...form, active })}
            label="Active in the catalogue"
          />
        </div>
      </Modal>

      <SidePanel
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={viewing ? `${viewing.category} · added ${formatDate(viewing.createdAt)}` : undefined}
        footer={
          viewing ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                openEdit(viewing);
                setViewing(null);
              }}
            >
              Edit hairstyle
            </button>
          ) : null
        }
      >
        {viewing ? (
          <div className="stack">
            <div className="thumb thumb-lg" aria-hidden="true">
              <span className="thumb-art" />
            </div>

            <dl className="stat-row">
              <div className="stat">
                <dt>Generations</dt>
                <dd>{formatNumber(viewing.generationCount)}</dd>
              </div>
              <div className="stat">
                <dt>Success rate</dt>
                <dd>{formatPercent(viewing.successRate)}</dd>
              </div>
              <div className="stat">
                <dt>Featured</dt>
                <dd>{viewing.featured ? 'Yes' : 'No'}</dd>
              </div>
              <div className="stat">
                <dt>Status</dt>
                <dd style={{ fontSize: '0.875rem' }}>
                  <EntityStatusBadge status={viewing.status} />
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="section-label">Description</h3>
              <p>{viewing.description ?? 'No description yet.'}</p>
            </div>

            <div>
              <h3 className="section-label">Tags</h3>
              <div className="chips">
                {viewing.tags.map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <p className="note">
              Generation stats come from the last 90 days of try-on requests and refresh nightly.
            </p>
          </div>
        ) : null}
      </SidePanel>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this hairstyle?"
        message={`“${pendingDelete?.name}” will be removed from the catalogue and from the app try-on picker. Past generations keep their history.`}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteHairstyle(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
