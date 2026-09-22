import { Hourglass, Plus, Scissors } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/common/Button';
import { IconButton } from '../../components/common/IconButton';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { TreatmentSheet } from '../../components/provider/team/TreatmentSheet';
import type { TreatmentDraft } from '../../components/provider/team/TreatmentSheet';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import type { ServicePayload } from '../../utils/catalogService';
import { messageOf } from '../../utils/errorMessage';
import { useProviderStore } from '../../store/useProviderStore';
import type { ProviderService } from '../../types';
import { formatBdt, formatDuration, formatNumber } from '../../utils/format';

/* The stylist's catalogue, sorted the way she thinks about it: the multi-step
   work she plans a whole afternoon around first, everything else after. Prep
   buffer is shown separately everywhere, because it is time she loses and the
   client never sees. */

const isMultiStep = (service: ProviderService): boolean => Boolean(service.steps?.length);

export default function TreatmentsPage() {
  const t = useT();
  const services = useProviderStore((state) => state.services);
  const addService = useProviderStore((state) => state.addService);
  const updateService = useProviderStore((state) => state.updateService);
  const toast = useAppStore((state) => state.toast);

  const categoryList = useProviderStore((state) => state.categories);
  const addCategory = useProviderStore((state) => state.addCategory);

  const [editing, setEditing] = useState<ProviderService | null>(null);
  const [adding, setAdding] = useState(false);

  const treatments = useMemo(() => services.filter(isMultiStep), [services]);
  const simple = useMemo(() => services.filter((service) => !isMultiStep(service)), [services]);
  const categories = useMemo(() => {
    const found = categoryList.map((entry) => entry.name);
    return found.length ? found : ['Treatments'];
  }, [categoryList]);

  /* The sheet works in headings, the API in ids. A heading nobody has used
     before has to exist before a service can point at it. */
  const categoryIdFor = async (name: string): Promise<number | null> => {
    const known = categoryList.find((entry) => entry.name === name);
    if (known) return known.id;
    if (!name.trim()) return null;
    return (await addCategory(name.trim())).id;
  };

  const payloadFor = async (draft: TreatmentDraft): Promise<ServicePayload> => ({
    name: draft.name,
    category_id: await categoryIdFor(draft.category),
    price: draft.price,
    duration_minutes: draft.duration,
    buffer_minutes: draft.bufferBefore,
    steps: draft.steps,
    is_active: draft.active,
    audience: 'female' as const,
  });

  const saveTreatment = async (draft: TreatmentDraft, id?: string) => {
    try {
      const payload = await payloadFor(draft);
      if (id) {
        await updateService(id, payload);
        toast('success', t('pt.treatmentSaved'), draft.name);
      } else {
        await addService(payload);
        toast('success', t('pt.treatmentAdded'), draft.name);
      }
      setEditing(null);
      setAdding(false);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    }
  };

  const blankDraft: TreatmentDraft = {
    name: '',
    category: categories[0],
    price: 0,
    duration: 60,
    bufferBefore: 15,
    steps: [t('pt.tplStep1'), t('pt.tplStep2'), t('pt.tplStep3'), t('pt.tplStep4')],
    active: true,
  };

  return (
    <Screen nav>
      <Header
        title={t('pt.treatmentsTitle')}
        actions={
          <IconButton label={t('pt.addTreatment')} variant="accent" onClick={() => setAdding(true)}>
            <Plus size={20} />
          </IconButton>
        }
      />
      <ScreenBody>
        <Callout tone="info" icon={<Hourglass size={18} aria-hidden="true" />} title={t('pt.prepExplainerTitle')}>
          {t('pt.prepExplainer')}
        </Callout>

        {/* --- Multi-step work --- */}
        <section className="section" aria-labelledby="pt-multi-head">
          <div className="pt-head">
            <h3 id="pt-multi-head">{t('pt.multiStep')}</h3>
            <p>{t('pt.multiStepHint')}</p>
          </div>
          {treatments.length ? (
            <div className="stack-sm">
              {treatments.map((service) => (
                <Card key={service.id} className="pt-treatment" onPress={() => setEditing(service)}>
                  <div className="between">
                    <strong className="subtitle">{service.name}</strong>
                    <span className="price">{formatBdt(service.price)}</span>
                  </div>
                  <div className="pt-treatment-times">
                    <span className="pro-pill pro-pill-info">
                      {t('pt.chairTime')} · {formatDuration(service.duration)}
                    </span>
                    <span className="pro-pill pro-pill-warning">
                      {service.bufferBefore
                        ? `${t('pt.prepTime')} · ${formatDuration(service.bufferBefore)}`
                        : t('pt.noPrep')}
                    </span>
                    <span className="pro-pill pro-pill-neutral">
                      {t('pt.blocksDiary', { duration: formatDuration(service.duration + service.bufferBefore) })}
                    </span>
                  </div>
                  <ol className="checklist pt-steps">
                    {(service.steps ?? []).map((step, index) => (
                      <li key={`${service.id}-${index}`}>
                        <span className="num">{formatNumber(index + 1)}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  {!service.active ? (
                    <span className="pro-pill pro-pill-neutral mt-2">{t('pt.hidden')}</span>
                  ) : null}
                </Card>
              ))}
              <Button variant="outline" block icon={<Plus size={16} />} onClick={() => setAdding(true)}>
                {t('pt.addTreatment')}
              </Button>
            </div>
          ) : (
            <EmptyState
              className="pt-empty"
              icon={<Scissors size={26} aria-hidden="true" />}
              title={t('pt.noTreatments')}
              description={t('pt.noTreatmentsBody')}
              action={
                <Button variant="outline" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
                  {t('pt.addTreatment')}
                </Button>
              }
            />
          )}
        </section>

        {/* --- Everything else --- */}
        <section className="section" aria-labelledby="pt-simple-head">
          <div className="pt-head">
            <h3 id="pt-simple-head">{t('pt.simpleServices')}</h3>
            <p>{t('pt.simpleHint')}</p>
          </div>
          {simple.length ? (
            <ul className="stack-sm">
              {simple.map((service) => (
                <li key={service.id}>
                  <Card pad="sm" className="pt-simple">
                    <div className="between">
                      <div className="stack-xs">
                        <strong>{service.name}</strong>
                        <span className="caption">
                          {formatDuration(service.duration)} · {formatBdt(service.price)}
                        </span>
                      </div>
                    </div>
                    <Toggle
                      label={t('pt.bookable')}
                      hint={t('pt.bookableHint')}
                      checked={service.active}
                      onChange={(on) => void updateService(service.id, { is_active: on })}
                    />
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <p className="muted pt-blank">{t('pt.noSimple')}</p>
            </Card>
          )}
        </section>
      </ScreenBody>

      <TreatmentSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t('pt.editTreatment')}
        categories={categories}
        initial={
          editing
            ? {
                name: editing.name,
                category: editing.category,
                price: editing.price,
                duration: editing.duration,
                bufferBefore: editing.bufferBefore,
                steps: editing.steps ?? [],
                active: editing.active,
              }
            : blankDraft
        }
        onSubmit={(draft) => {
          if (!editing) return;
          void saveTreatment(draft, editing.id);
        }}
      />

      <TreatmentSheet
        open={adding}
        onClose={() => setAdding(false)}
        title={t('pt.newTreatment')}
        categories={categories}
        initial={blankDraft}
        onSubmit={(draft) => void saveTreatment(draft)}
      />
    </Screen>
  );
}
