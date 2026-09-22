import { AlertTriangle, Pencil, Plus, Scissors, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { Price } from '../../components/common/Price';
import { Segmented } from '../../components/common/Tabs';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import {
  ServiceFormSheet,
  type SalonServiceDraft,
} from '../../components/provider/salon/ServiceFormSheet';
import { chairsFor } from '../../components/provider/salon/salonLabels';
import { Spinner } from '../../components/common/Spinner';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { ProviderService } from '../../types';
import type { ServicePayload } from '../../utils/catalogService';
import { messageOf } from '../../utils/errorMessage';
import { formatDuration, formatNumber } from '../../utils/format';

type Filter = 'all' | 'active' | 'unassigned';

export default function SalonServicesPage() {
  const t = useT();
  const services = useProviderStore((s) => s.services);
  const staff = useProviderStore((s) => s.staff);
  const categories = useProviderStore((s) => s.categories);
  const addService = useProviderStore((s) => s.addService);
  const updateService = useProviderStore((s) => s.updateService);
  const removeService = useProviderStore((s) => s.removeService);
  const addCategory = useProviderStore((s) => s.addCategory);
  const status = useProviderStore((s) => s.status);
  const error = useProviderStore((s) => s.error);
  const load = useProviderStore((s) => s.load);
  const toast = useAppStore((s) => s.toast);

  const [filter, setFilter] = useState<Filter>('all');
  /** `null` means the sheet is closed; `'new'` adds; anything else edits. */
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Every write here ends the same way: say it worked, or say why not. */
  const save = async (run: () => Promise<unknown>, done: string, detail?: string) => {
    try {
      await run();
      toast('success', done, detail);
      return true;
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
      return false;
    }
  };

  const saveService = async (draft: SalonServiceDraft) => {
    setSaving(true);
    try {
      const categoryId = draft.newCategory
        ? (await addCategory(draft.newCategory)).id
        : draft.categoryId;
      const payload: ServicePayload = {
        name: draft.name,
        category_id: categoryId,
        price: draft.price,
        duration_minutes: draft.duration,
        buffer_minutes: draft.bufferBefore,
        description: draft.description,
        eligible_employee_ids: draft.staffIds.map(Number),
      };
      const ok =
        editing === 'new'
          ? await save(() => addService(payload), t('salon.serviceAddedToast', { name: draft.name }))
          : await save(
              () => updateService(String(editing), payload),
              t('salon.serviceSavedToast', { name: draft.name }),
            );
      if (ok) setEditing(null);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: services.length,
      active: services.filter((service) => service.active).length,
      unassigned: services.filter((service) => chairsFor(service.staffIds, staff).length === 0).length,
    }),
    [services, staff],
  );

  const shown = useMemo(() => {
    const rows = services.filter((service) =>
      filter === 'active'
        ? service.active
        : filter === 'unassigned'
          ? chairsFor(service.staffIds, staff).length === 0
          : true,
    );
    const groups = new Map<string, ProviderService[]>();
    for (const service of rows) {
      const bucket = groups.get(service.category);
      if (bucket) bucket.push(service);
      else groups.set(service.category, [service]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [services, staff, filter]);

  const editingService = editing && editing !== 'new' ? (services.find((s) => s.id === editing) ?? null) : null;
  const removing = removingId ? (services.find((s) => s.id === removingId) ?? null) : null;

  /* Each filter deserves its own empty state: "no gaps" is good news, an
     empty menu is not. */
  const empty =
    filter === 'active'
      ? { title: t('salon.noneActiveTitle'), body: t('salon.noneActiveBody') }
      : filter === 'unassigned'
        ? { title: t('salon.noGapsTitle'), body: t('salon.noGapsBody') }
        : { title: t('salon.emptyServicesTitle'), body: t('salon.emptyServicesBody') };

  return (
    <Screen nav>
      <Header title={t('salon.servicesTitle')} />
      <ScreenBody className="sp-menu-screen">
        {status === 'loading' && services.length === 0 ? (
          <div className="fullscreen-center">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        ) : status === 'error' ? (
          <EmptyState
            icon={<Scissors size={26} aria-hidden="true" />}
            title={t('state.loadFailedTitle')}
            description={error ?? undefined}
            action={<Button onClick={() => void load()}>{t('state.retry')}</Button>}
          />
        ) : null}
        <Segmented
          label={t('salon.servicesTitle')}
          active={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: t('salon.filterAll'), count: counts.all },
            { id: 'active', label: t('salon.filterActive'), count: counts.active },
            { id: 'unassigned', label: t('salon.filterUnassigned'), count: counts.unassigned },
          ]}
        />

        {shown.length ? (
          shown.map(([category, rows]) => (
            <section className="section" key={category}>
              <div className="pro-section-head ps-chapter">
                <h3>{category}</h3>
                <span>{t('salon.serviceCount', { count: formatNumber(rows.length) })}</span>
              </div>

              <div className="ps-staff sp-menu-list">
                {rows.map((service) => {
                  const assigned = chairsFor(service.staffIds, staff).length;
                  return (
                    <div key={service.id} className="ps-staff-card sp-dish" data-inactive={service.active ? undefined : 'true'}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <div className="ps-staff-body">
                          <span className="ps-staff-name">{service.name}</span>
                          <span className="ps-staff-meta">
                            <Price value={service.price} />
                            <span>{formatDuration(service.duration)}</span>
                            {service.bufferBefore ? (
                              <Badge tone="neutral">{`+${formatDuration(service.bufferBefore)}`}</Badge>
                            ) : null}
                          </span>
                          <span className="ps-staff-meta">
                            <Users size={14} aria-hidden="true" />
                            {assigned ? (
                              <span>{t('salon.stylistsCount', { count: formatNumber(assigned) })}</span>
                            ) : (
                              <strong style={{ color: 'var(--status-warning-ink)' }}>{t('salon.nobodyAssigned')}</strong>
                            )}
                          </span>
                        </div>
                        <div className="row-xs">
                          <IconButton label={t('salon.editService')} onClick={() => setEditing(service.id)}>
                            <Pencil size={18} />
                          </IconButton>
                          <IconButton label={t('salon.removeService')} onClick={() => setRemovingId(service.id)}>
                            <Trash2 size={18} />
                          </IconButton>
                        </div>
                      </div>

                      {assigned ? null : (
                        <Callout tone="warning" icon={<AlertTriangle size={16} aria-hidden="true" />}>
                          {t('salon.nobodyAssignedWarning')}
                        </Callout>
                      )}

                      <div className="ps-staff-foot">
                        <Toggle
                          checked={service.active}
                          onChange={(active) =>
                            void save(
                              () => updateService(service.id, { is_active: active }),
                              t('salon.serviceSavedToast', { name: service.name }),
                            )
                          }
                          label={t('salon.serviceActive')}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <EmptyState
            icon={<Scissors size={26} aria-hidden="true" />}
            title={empty.title}
            description={empty.body}
            tone={filter === 'unassigned' ? 'success' : 'neutral'}
          />
        )}
      </ScreenBody>

      <StickyFooter>
        <Button block icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing('new')}>
          {t('salon.addService')}
        </Button>
      </StickyFooter>

      <ServiceFormSheet
        key={editing ?? 'closed'}
        open={editing !== null}
        onClose={() => setEditing(null)}
        service={editingService}
        staff={staff}
        categories={categories}
        saving={saving}
        onSave={(values) => void saveService(values)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemovingId(null)}
        onConfirm={() => {
          if (!removing) return;
          void save(
            () => removeService(removing.id),
            t('salon.serviceRemovedToast', { name: removing.name }),
          ).finally(() => setRemovingId(null));
        }}
        title={removing ? t('salon.removeServiceTitle', { name: removing.name }) : ''}
        description={t('salon.removeServiceBody')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
        tone="danger"
        icon={<Trash2 size={22} aria-hidden="true" />}
      />
    </Screen>
  );
}
