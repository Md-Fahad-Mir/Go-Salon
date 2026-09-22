import { EyeOff, Plus, Scissors } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import {
  ServiceSheet,
  type ServiceDraft,
} from '../../components/provider/business/ServiceSheet';
import { Spinner } from '../../components/common/Spinner';
import { useT } from '../../hooks/useLanguage';
import { useRole } from '../../hooks/useRole';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { ProviderService } from '../../types';
import type { ServicePayload } from '../../utils/catalogService';
import { messageOf } from '../../utils/errorMessage';
import { formatBdt, formatDuration, formatNumber } from '../../utils/format';

/** What the professional does and what they charge for it. The switch on each
    row is the one thing that changes hour to hour — a service that has run out
    of colour, or a barber who does not want beard work today — so it sits on
    the row itself rather than behind the edit sheet. */
export default function ServicesPage() {
  const t = useT();
  const { servesWomen } = useRole();
  const services = useProviderStore((state) => state.services);
  const categories = useProviderStore((state) => state.categories);
  const addService = useProviderStore((state) => state.addService);
  const updateService = useProviderStore((state) => state.updateService);
  const removeService = useProviderStore((state) => state.removeService);
  const addCategory = useProviderStore((state) => state.addCategory);
  const status = useProviderStore((state) => state.status);
  const error = useProviderStore((state) => state.error);
  const load = useProviderStore((state) => state.load);
  const toast = useAppStore((state) => state.toast);

  /* null = the sheet is closed; { service: null } = adding a new one. */
  const [sheet, setSheet] = useState<{ service: ProviderService | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProviderService | null>(null);
  const [saving, setSaving] = useState(false);

  const isStylist = servesWomen;

  const active = useMemo(() => services.filter((service) => service.active), [services]);
  /* Grouped by the heading each service actually carries, in the order the
     services arrive — which is already the catalogue's own order. */
  const grouped = useMemo(() => {
    const headings = [...new Set(services.map((service) => service.category || ''))];
    return headings.map((heading) => ({
      category: heading,
      items: services.filter((service) => (service.category || '') === heading),
    }));
  }, [services]);

  const prices = active.map((service) => service.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;

  const handleSave = async (draft: ServiceDraft) => {
    const editing = sheet?.service;
    setSaving(true);
    try {
      // A heading nobody has used before has to exist before a service can
      // point at it, so it is created first and its id used below.
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
        includes: draft.includes,
        audience: draft.audience,
      };

      if (editing) {
        await updateService(editing.id, payload);
        toast('success', t('pb.svcSaved'), draft.name);
      } else {
        await addService(payload);
        toast('success', t('pb.svcAdded'), draft.name);
      }
      setSheet(null);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (service: ProviderService, on: boolean) => {
    try {
      await updateService(service.id, { is_active: on });
      toast('info', t(on ? 'pb.svcOn' : 'pb.svcOff', { name: service.name }));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await removeService(pendingDelete.id);
      toast('success', t('pb.svcDeleted'), pendingDelete.name);
      setSheet(null);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <Screen nav>
      <Header title={t('nav.services')} />
      <ScreenBody className="pb-screen pb-rates">
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
        ) : services.length === 0 ? (
          <EmptyState
            icon={<Scissors size={26} aria-hidden="true" />}
            title={t('pb.svcEmptyTitle')}
            description={t('pb.svcEmptyBody')}
            action={
              <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setSheet({ service: null })}>
                {t('pb.addService')}
              </Button>
            }
          />
        ) : (
          <>
            <section className="pb-headline" aria-labelledby="pb-svc-headline">
              <strong className="display" id="pb-svc-headline">
                {t('pb.svcHeadline', { count: formatNumber(active.length) })}
              </strong>
              <p className="caption">
                {low === high
                  ? t('pb.svcPriceOne', { price: formatBdt(low) })
                  : t('pb.svcPriceRange', { min: formatBdt(low), max: formatBdt(high) })}
              </p>
              {services.length > active.length ? (
                <p className="dim pb-headline-note">
                  <EyeOff size={14} aria-hidden="true" />
                  {t('pb.svcHiddenCount', { count: formatNumber(services.length - active.length) })}
                </p>
              ) : null}
            </section>

            {active.length === 0 ? (
              <Callout tone="warning" title={t('pb.svcNoneActiveTitle')}>
                {t('pb.svcNoneActiveBody')}
              </Callout>
            ) : null}

            {grouped.map((group) => (
              <section className="section" key={group.category} aria-label={group.category}>
                <div className="pro-section-head">
                  <h3>{group.category}</h3>
                  <span>{formatNumber(group.items.length)}</span>
                </div>
                <div className="stack-sm">
                  {group.items.map((service) => (
                    <article className="pb-service" key={service.id} data-off={service.active ? undefined : 'true'}>
                      <button
                        type="button"
                        className="pb-service-main"
                        onClick={() => setSheet({ service })}
                        aria-label={t('pb.editServiceNamed', { name: service.name })}
                      >
                        <span className="pb-service-head">
                          <span className="pb-service-name">{service.name}</span>
                          {service.popular ? <Badge tone="accent">{t('pb.popular')}</Badge> : null}
                        </span>
                        <span className="pb-service-meta">
                          <span>{formatDuration(service.duration)}</span>
                          <span aria-hidden="true">·</span>
                          <strong>{formatBdt(service.price)}</strong>
                          {service.bufferBefore > 0 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {t('pb.svcBufferMeta', { duration: formatDuration(service.bufferBefore) })}
                              </span>
                            </>
                          ) : null}
                        </span>
                        {!service.active ? (
                          <span className="pb-service-off">{t('pb.hiddenFromCustomers')}</span>
                        ) : null}
                      </button>
                      <div className="pb-service-switch">
                        <Toggle
                          checked={service.active}
                          onChange={(on) => void handleToggle(service, on)}
                          label={service.name}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </ScreenBody>

      <StickyFooter>
        <Button block icon={<Plus size={18} aria-hidden="true" />} onClick={() => setSheet({ service: null })}>
          {t('pb.addService')}
        </Button>
      </StickyFooter>

      {sheet ? (
        <ServiceSheet
          key={sheet.service?.id ?? 'new'}
          service={sheet.service}
          categories={categories}
          emphasiseBuffer={isStylist}
          askAudience
          saving={saving}
          onClose={() => setSheet(null)}
          onSave={(draft) => void handleSave(draft)}
          onDelete={sheet.service ? () => setPendingDelete(sheet.service) : undefined}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        tone="danger"
        title={t('pb.svcDeleteTitle', { name: pendingDelete?.name ?? '' })}
        description={t('pb.svcDeleteBody')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
      />
    </Screen>
  );
}
