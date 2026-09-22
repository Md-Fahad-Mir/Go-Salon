import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderService, ServiceAudience, ServiceCategory } from '../../../types';
import { Button } from '../../common/Button';
import { BottomSheet } from '../../common/BottomSheet';
import { IconButton } from '../../common/IconButton';
import { Input, Select, Textarea } from '../../common/Input';
import { formatNumber } from '../../../utils/format';

/** Everything the provider can change about a service. Who may perform it,
    whether it is switched on and whether it is flagged popular are not here —
    they belong to the roster and to the row's own switch. */
export interface ServiceDraft {
  name: string;
  /** The heading it sits under. Null while `newCategory` is being made. */
  categoryId: number | null;
  /** Set when the professional typed a heading that does not exist yet; the
      page creates it and uses the id it gets back. */
  newCategory?: string;
  price: number;
  duration: number;
  bufferBefore: number;
  description: string;
  includes: string[];
  /** Who the service is for. A barber says this per service. */
  audience: ServiceAudience;
}

interface ServiceSheetProps {
  /** The service being edited, or null when adding a new one. */
  service: ProviderService | null;
  /** Headings available to this account: the shared catalogue plus its own. */
  categories: ServiceCategory[];
  /** A salon inherits who it serves from the room, so only a barber is asked
      per service. */
  askAudience?: boolean;
  saving?: boolean;
  /** Colour and bridal work lives or dies on prep time, so the stylist's
      buffer field is called out rather than tucked away. */
  emphasiseBuffer?: boolean;
  onClose: () => void;
  onSave: (draft: ServiceDraft) => void;
  onDelete?: () => void;
}

const NEW_CATEGORY = '__new';

/** Digits only, so a stray letter never reaches `Number()`. */
const digitsOnly = (value: string): string => value.replace(/[^\d]/g, '');

export function ServiceSheet({
  service,
  categories,
  emphasiseBuffer,
  askAudience,
  saving,
  onClose,
  onSave,
  onDelete,
}: ServiceSheetProps) {
  const t = useT();
  const known = categories;

  const [name, setName] = useState(service?.name ?? '');
  const [category, setCategory] = useState(
    service?.categoryId != null
      ? String(service.categoryId)
      : known.length
        ? String(known[0].id)
        : NEW_CATEGORY,
  );
  const [newCategory, setNewCategory] = useState('');
  const [audience, setAudience] = useState<ServiceAudience>(service?.audience ?? 'all');
  const [price, setPrice] = useState(service ? String(service.price) : '');
  const [duration, setDuration] = useState(service ? String(service.duration) : '');
  const [buffer, setBuffer] = useState(service ? String(service.bufferBefore) : '0');
  const [description, setDescription] = useState(service?.description ?? '');
  const [includes, setIncludes] = useState<string[]>(service?.includes ?? []);
  const [submitted, setSubmitted] = useState(false);

  const priceValue = Number(price || 0);
  const durationValue = Number(duration || 0);
  const isNewCategory = category === NEW_CATEGORY;

  const errors = {
    name: name.trim() ? undefined : t('pb.errName'),
    price: priceValue > 0 ? undefined : t('pb.errPrice'),
    duration: durationValue > 0 ? undefined : t('pb.errDuration'),
    newCategory: isNewCategory && !newCategory.trim() ? t('pb.errCategoryName') : undefined,
  };
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (errors.name || errors.price || errors.duration || errors.newCategory) return;
    onSave({
      name: name.trim(),
      categoryId: isNewCategory ? null : Number(category),
      newCategory: isNewCategory ? newCategory.trim() : undefined,
      price: priceValue,
      duration: durationValue,
      bufferBefore: Number(digitsOnly(buffer) || 0),
      description: description.trim(),
      includes: includes.map((line) => line.trim()).filter(Boolean),
      audience,
    });
  };

  const categoryOptions = [
    ...known.map((entry) => ({ value: String(entry.id), label: entry.name })),
    { value: NEW_CATEGORY, label: t('pb.svcCategoryNew') },
  ];

  const audienceOptions: Array<{ value: ServiceAudience; label: string }> = [
    { value: 'all', label: t('pb.audienceAll') },
    { value: 'male', label: t('pb.audienceMale') },
    { value: 'female', label: t('pb.audienceFemale') },
  ];

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={service ? t('pb.editService') : t('pb.newService')}
      footer={
        <>
          <Button block loading={saving} onClick={submit}>{t('action.save')}</Button>
          {onDelete ? (
            <Button
              variant="danger-soft"
              block
              icon={<Trash2 size={18} aria-hidden="true" />}
              onClick={onDelete}
            >
              {t('action.delete')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <Input
          label={t('pb.svcName')}
          placeholder={t('pb.svcNamePlaceholder')}
          value={name}
          error={show('name')}
          onChange={(event) => setName(event.target.value)}
        />

        <Select
          label={t('pb.svcCategory')}
          options={categoryOptions}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        {isNewCategory ? (
          <Input
            label={t('pb.svcCategoryName')}
            placeholder={t('pb.svcCategoryPlaceholder')}
            value={newCategory}
            error={submitted ? errors.newCategory : undefined}
            onChange={(event) => setNewCategory(event.target.value)}
          />
        ) : null}

        {askAudience ? (
          <Select
            label={t('pb.svcAudience')}
            hint={t('pb.svcAudienceHint')}
            options={audienceOptions}
            value={audience}
            onChange={(event) => setAudience(event.target.value as ServiceAudience)}
          />
        ) : null}

        <div className="grid-2">
          <Input
            label={t('pb.svcPrice')}
            type="text"
            inputMode="numeric"
            icon={<span aria-hidden="true">৳</span>}
            value={price}
            error={show('price')}
            onChange={(event) => setPrice(digitsOnly(event.target.value))}
          />
          <Input
            label={t('pb.svcDuration')}
            type="text"
            inputMode="numeric"
            value={duration}
            error={show('duration')}
            onChange={(event) => setDuration(digitsOnly(event.target.value))}
          />
        </div>
        <p className="field-hint">{t('pb.svcDurationHint')}</p>

        <Input
          className={emphasiseBuffer ? 'pb-buffer-emph' : undefined}
          label={t('pb.svcBuffer')}
          hint={emphasiseBuffer ? t('pb.svcBufferHintStylist') : t('pb.svcBufferHint')}
          type="text"
          inputMode="numeric"
          value={buffer}
          onChange={(event) => setBuffer(digitsOnly(event.target.value))}
        />

        <Textarea
          label={t('pb.svcDescription')}
          placeholder={t('pb.svcDescriptionPlaceholder')}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <fieldset className="pb-fieldset">
          <legend className="field-label">{t('pb.svcIncludes')}</legend>
          <p className="field-hint">{t('pb.svcIncludesHint')}</p>
          <div className="stack-sm">
            {includes.map((line, index) => (
              /* Lines have no id of their own and can repeat, so their
                 position is the only stable handle there is. */
              <div className="pb-includes-row" key={index}>
                <Input
                  className="grow"
                  aria-label={t('pb.svcIncludesLine', { index: formatNumber(index + 1) })}
                  placeholder={t('pb.svcIncludesPlaceholder')}
                  value={line}
                  onChange={(event) =>
                    setIncludes((lines) =>
                      lines.map((existing, i) => (i === index ? event.target.value : existing)),
                    )
                  }
                />
                <IconButton
                  label={t('pb.svcIncludesRemove', { index: formatNumber(index + 1) })}
                  onClick={() => setIncludes((lines) => lines.filter((_, i) => i !== index))}
                >
                  <X size={18} />
                </IconButton>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => setIncludes((lines) => [...lines, ''])}
            >
              {t('pb.svcIncludesAdd')}
            </Button>
          </div>
        </fieldset>

        {service?.steps?.length ? (
          <section className="stack-sm" aria-labelledby="pb-steps">
            <h3 className="field-label" id="pb-steps">{t('pb.svcSteps')}</h3>
            <ol className="checklist">
              {service.steps.map((step, index) => (
                <li key={step}>
                  <span className="num">{formatNumber(index + 1)}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </BottomSheet>
  );
}
