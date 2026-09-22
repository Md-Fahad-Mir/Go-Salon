import { useState } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderService, ServiceCategory, StaffRecord } from '../../../types';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input, Select, Textarea } from '../../common/Input';
import { PickList } from './PickList';

interface ServiceFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Absent when adding a new line to the menu. */
  service: ProviderService | null;
  staff: StaffRecord[];
  /** Headings available to this salon: the shared catalogue plus its own. */
  categories: ServiceCategory[];
  saving?: boolean;
  onSave: (values: SalonServiceDraft) => void;
}

/** What the owner can set about a line on the menu. */
export interface SalonServiceDraft {
  name: string;
  categoryId: number | null;
  /** Set when the owner typed a heading that does not exist yet. */
  newCategory?: string;
  price: number;
  duration: number;
  bufferBefore: number;
  description: string;
  /** Employment ids. **Empty means every active chair** — the form says so
      out loud rather than leaving the owner to guess. */
  staffIds: string[];
}

const NEW_CATEGORY = '__new';

/** The menu editor. The stylist checklist is the half only an owner sees:
    a service nobody is cleared for cannot be booked, so it is part of the
    same form rather than hidden behind another screen. */
export function ServiceFormSheet({
  open,
  onClose,
  service,
  staff,
  categories,
  saving,
  onSave,
}: ServiceFormSheetProps) {
  const t = useT();
  const [name, setName] = useState(service?.name ?? '');
  const [category, setCategory] = useState(
    service?.categoryId != null
      ? String(service.categoryId)
      : categories.length
        ? String(categories[0].id)
        : NEW_CATEGORY,
  );
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState(service ? String(service.price) : '');
  const [duration, setDuration] = useState(service ? String(service.duration) : '30');
  const [buffer, setBuffer] = useState(service ? String(service.bufferBefore) : '0');
  const [description, setDescription] = useState(service?.description ?? '');
  const [staffIds, setStaffIds] = useState<string[]>(service?.staffIds ?? []);
  const [touched, setTouched] = useState(false);

  const priceValue = Number(price);
  const durationValue = Number(duration);
  const bufferValue = Number(buffer);

  const isNewCategory = category === NEW_CATEGORY;
  const errors = {
    name: !name.trim() ? t('salon.errServiceName') : undefined,
    category: isNewCategory && !newCategory.trim() ? t('salon.errCategory') : undefined,
    price: !price.trim() || Number.isNaN(priceValue) || priceValue <= 0 ? t('salon.errPrice') : undefined,
    duration: !duration.trim() || Number.isNaN(durationValue) || durationValue <= 0 ? t('salon.errDuration') : undefined,
    buffer: Number.isNaN(bufferValue) || bufferValue < 0 ? t('salon.errBuffer') : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const show = (error?: string) => (touched ? error : undefined);

  const submit = () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    onSave({
      name: name.trim(),
      categoryId: isNewCategory ? null : Number(category),
      newCategory: isNewCategory ? newCategory.trim() : undefined,
      price: Math.round(priceValue),
      duration: Math.round(durationValue),
      bufferBefore: Math.round(bufferValue),
      description: description.trim(),
      staffIds,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={service ? t('salon.editService') : t('salon.newService')}
      footer={<Button block loading={saving} onClick={submit}>{t('action.save')}</Button>}
    >
      <div className="stack">
        <Input
          label={t('salon.fieldServiceName')}
          placeholder={t('salon.fieldServiceNamePlaceholder')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={show(errors.name)}
          autoComplete="off"
        />
        <Select
          label={t('salon.fieldCategory')}
          options={[
            ...categories.map((entry) => ({ value: String(entry.id), label: entry.name })),
            { value: NEW_CATEGORY, label: t('pb.svcCategoryNew') },
          ]}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        {isNewCategory ? (
          <Input
            label={t('pb.svcCategoryName')}
            placeholder={t('salon.fieldCategoryPlaceholder')}
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            error={show(errors.category)}
            autoComplete="off"
          />
        ) : null}
        <div className="grid-2">
          <Input
            label={t('salon.fieldPrice')}
            type="number"
            inputMode="numeric"
            min={0}
            step={50}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            error={show(errors.price)}
            suffix={<span className="ps-suffix sp-unit">{t('salon.takaUnit')}</span>}
          />
          <Input
            label={t('salon.fieldDuration')}
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            error={show(errors.duration)}
            suffix={<span className="ps-suffix sp-unit">{t('salon.minutesUnit')}</span>}
          />
        </div>
        <Input
          label={t('salon.fieldBuffer')}
          hint={t('salon.fieldBufferHint')}
          type="number"
          inputMode="numeric"
          min={0}
          step={5}
          value={buffer}
          onChange={(event) => setBuffer(event.target.value)}
          error={show(errors.buffer)}
          suffix={<span className="ps-suffix sp-unit">{t('salon.minutesUnit')}</span>}
        />
        <Textarea
          label={t('salon.fieldDescription')}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          optional
        />
        {/* Leaving every box clear is not "nobody": a service that names no
            chair is open to all of them, and stays open as staff come and go. */}
        <PickList
          label={t('salon.fieldServiceStylists')}
          options={staff.map((member) => ({
            id: member.id,
            label: member.name,
            hint: member.active ? member.title : t('salon.notTakingBookings'),
          }))}
          selected={staffIds}
          onChange={setStaffIds}
          emptyLabel={t('salon.emptyStaffBody')}
        />
      </div>
    </BottomSheet>
  );
}
