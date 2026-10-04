import { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { Hairstyle } from '../types';
import { HAIRSTYLE_CATEGORIES } from '../constants';
import { useStore } from '../store/useStore';
import { useTableState } from '../hooks/useTableState';
import { useAsyncList } from '../hooks/useAsyncList';
import { hairstyleService } from '../utils/adminService';
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
import { ImageUploader } from '../components/ui/ImageUploader';
import { EntityStatusBadge } from '../components/ui/StatusBadge';
import { RowMenu } from '../components/ui/RowMenu';
import { formatDate, formatNumber } from '../utils/format';

interface FormState {
  name: string;
  category: string;
  description: string;
  image: string | undefined;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  category: 'Haircut',
  description: '',
  image: undefined,
  active: true,
};

export default function HairstylesPage() {
  const pushToast = useStore((state) => state.pushToast);
  const { data: hairstyles, loading, error, refetch } = useAsyncList(() => hairstyleService.list());

  const [editing, setEditing] = useState<Hairstyle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [customCategory, setCustomCategory] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Hairstyle | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Hairstyle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categoryOptions = useMemo(() => {
    const fromData = new Set(hairstyles.map((row) => row.category));
    HAIRSTYLE_CATEGORIES.forEach((category) => fromData.add(category));
    return Array.from(fromData);
  }, [hairstyles]);

  const filters = useMemo(
    () => [
      {
        key: 'category',
        label: 'Category',
        options: categoryOptions.map((value) => ({ value, label: value })),
        match: (row: Hairstyle, value: string) => row.category === value,
      },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
        match: (row: Hairstyle, value: string) => row.status === value,
      },
    ],
    [categoryOptions],
  );

  const table = useTableState<Hairstyle>({
    rows: hairstyles,
    searchOn: (row) => [row.id, row.name, row.category],
    filters,
    sortAccessors: {
      name: (row) => row.name,
      category: (row) => row.category,
      generationCount: (row) => row.generationCount,
    },
    initialSort: { key: 'generationCount', direction: 'desc' },
  });

  const nameError = touched && !form.name.trim() ? 'A name is required' : undefined;
  const valid = form.name.trim().length > 1 && form.category.trim().length > 0;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCustomCategory(false);
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
      active: row.status === 'active',
    });
    setCustomCategory(!(HAIRSTYLE_CATEGORIES as readonly string[]).includes(row.category));
    setTouched(false);
    setFormOpen(true);
  };

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    const input = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || undefined,
      image: form.image,
      active: form.active,
    };
    setSaving(true);
    try {
      if (editing) {
        await hairstyleService.update(editing.id, input);
        pushToast('success', 'Hairstyle updated', input.name);
      } else {
        await hairstyleService.create(input);
        pushToast('success', 'Hairstyle added', input.name);
      }
      setFormOpen(false);
      refetch();
    } catch (err) {
      pushToast('error', 'Could not save', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: Hairstyle, active: boolean) => {
    try {
      await hairstyleService.update(row.id, { active });
      refetch();
    } catch (err) {
      pushToast('error', 'Could not update status', err instanceof ApiError ? err.message : 'Try again.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await hairstyleService.remove(pendingDelete.id);
      pushToast('success', 'Hairstyle deleted', pendingDelete.name);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      pushToast('error', 'Could not delete', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setDeleting(false);
    }
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
      key: 'generationCount',
      header: 'Generations',
      sortable: true,
      align: 'end',
      render: (row) => formatNumber(row.generationCount),
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
            onChange={(checked) => toggleActive(row, checked)}
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
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add hairstyle
          </button>
        }
      />

      <section className="card">
        {error ? (
          <EmptyState
            title="Couldn't load the catalogue"
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
              placeholder="Search by name or category…"
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
              loading={loading}
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
          </>
        )}
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
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (!valid && touched)}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save hairstyle'}
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
            {customCategory ? (
              <div className="row" style={{ gap: '0.5rem' }}>
                <input
                  className="input"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="New category name"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCustomCategory(false);
                    setForm({ ...form, category: HAIRSTYLE_CATEGORIES[0] });
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                className="select"
                value={form.category}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setCustomCategory(true);
                    setForm({ ...form, category: '' });
                  } else {
                    setForm({ ...form, category: event.target.value });
                  }
                }}
              >
                {HAIRSTYLE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="__new__">+ Add new category</option>
              </select>
            )}
          </Field>

          <Field label="Prompt" className="form-span-2" hint="The prompt sent to the AI generator for this style.">
            <textarea
              className="textarea"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="e.g. A textured crop haircut, short on the sides, tousled on top"
            />
          </Field>

          <Field label="Primary image" className="form-span-2">
            <div>
              <ImageUploader value={form.image} onChange={(image) => setForm({ ...form, image })} />
            </div>
          </Field>

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
                <dt>Status</dt>
                <dd style={{ fontSize: '0.875rem' }}>
                  <EntityStatusBadge status={viewing.status} />
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="section-label">Prompt</h3>
              <p>{viewing.description ?? 'No prompt yet.'}</p>
            </div>
          </div>
        ) : null}
      </SidePanel>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this hairstyle?"
        message={`“${pendingDelete?.name}” will be removed from the catalogue and from the app try-on picker.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
