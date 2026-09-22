import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { IconButton } from '../../common/IconButton';
import { Input, Select } from '../../common/Input';
import { Toggle } from '../../common/Toggle';
import { useT } from '../../../hooks/useLanguage';
import { formatNumber } from '../../../utils/format';

/* The editor behind every treatment card. Prep buffer sits beside chair time
   with its own hint, because the difference between the two is the whole point
   of this screen. */

export interface TreatmentDraft {
  name: string;
  category: string;
  price: number;
  duration: number;
  bufferBefore: number;
  steps: string[];
  active: boolean;
}

interface TreatmentSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: TreatmentDraft;
  categories: string[];
  onSubmit: (draft: TreatmentDraft) => void;
}

export function TreatmentSheet({ open, onClose, title, initial, categories, onSubmit }: TreatmentSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {open ? (
        <TreatmentForm initial={initial} categories={categories} onSubmit={onSubmit} />
      ) : null}
    </BottomSheet>
  );
}

type Errors = Partial<Record<'name' | 'price' | 'duration' | 'buffer' | 'steps', string>>;

function TreatmentForm({
  initial,
  categories,
  onSubmit,
}: Pick<TreatmentSheetProps, 'initial' | 'categories' | 'onSubmit'>) {
  const t = useT();
  const [draft, setDraft] = useState<TreatmentDraft>(initial);
  const [errors, setErrors] = useState<Errors>({});

  /* Editing anything clears the messages, so a corrected field stops shouting
     before the stylist reaches the save button. */
  const patch = (next: Partial<TreatmentDraft>) => {
    setErrors({});
    setDraft((current) => ({ ...current, ...next }));
  };

  const setStep = (index: number, value: string) =>
    patch({ steps: draft.steps.map((step, i) => (i === index ? value : step)) });

  const move = (index: number, by: -1 | 1) => {
    const next = [...draft.steps];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ steps: next });
  };

  const submit = () => {
    const steps = draft.steps.map((step) => step.trim()).filter(Boolean);
    const next: Errors = {};
    if (!draft.name.trim()) next.name = t('pt.errName');
    if (!(draft.price > 0)) next.price = t('pt.errPrice');
    if (!(draft.duration >= 5)) next.duration = t('pt.errDuration');
    if (draft.bufferBefore < 0 || Number.isNaN(draft.bufferBefore)) next.buffer = t('pt.errBuffer');
    if (!steps.length) next.steps = t('pt.errSteps');
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ ...draft, name: draft.name.trim(), steps });
  };

  return (
    <div className="stack">
      <Input
        label={t('pt.nameLabel')}
        value={draft.name}
        placeholder={t('pt.namePlaceholder')}
        error={errors.name}
        onChange={(event) => patch({ name: event.target.value })}
      />

      <Select
        label={t('pt.categoryLabel')}
        value={draft.category}
        options={categories.map((category) => ({ value: category, label: category }))}
        onChange={(event) => patch({ category: event.target.value })}
      />

      <Input
        label={t('pt.priceLabel')}
        type="number"
        inputMode="numeric"
        min={0}
        value={String(draft.price)}
        error={errors.price}
        onChange={(event) => patch({ price: Number(event.target.value) })}
      />

      <div className="grid-2">
        <Input
          label={t('pt.durationLabel')}
          type="number"
          inputMode="numeric"
          min={5}
          step={5}
          value={String(draft.duration)}
          error={errors.duration}
          onChange={(event) => patch({ duration: Number(event.target.value) })}
        />
        <Input
          label={t('pt.bufferLabel')}
          type="number"
          inputMode="numeric"
          min={0}
          step={5}
          value={String(draft.bufferBefore)}
          hint={t('pt.bufferHint')}
          error={errors.buffer}
          onChange={(event) => patch({ bufferBefore: Number(event.target.value) })}
        />
      </div>

      <div className="stack-sm">
        <div className="between">
          <span className="label">{t('pt.stepsLabel')}</span>
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus size={15} />}
            onClick={() => patch({ steps: [...draft.steps, ''] })}
          >
            {t('pt.addStep')}
          </Button>
        </div>
        <ol className="pt-step-edit">
          {draft.steps.map((step, index) => {
            const label = formatNumber(index + 1);
            return (
              <li key={index}>
                <span className="pt-step-num" aria-hidden="true">{label}</span>
                <Input
                  className="grow"
                  value={step}
                  placeholder={t('pt.stepPlaceholder')}
                  aria-label={t('pt.stepNumber', { index: label })}
                  onChange={(event) => setStep(index, event.target.value)}
                />
                <span className="pt-step-tools">
                  <IconButton
                    label={t('pt.moveStepUp', { index: label })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton
                    label={t('pt.moveStepDown', { index: label })}
                    disabled={index === draft.steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </IconButton>
                  <IconButton
                    label={t('pt.removeStep', { index: label })}
                    onClick={() => patch({ steps: draft.steps.filter((_, i) => i !== index) })}
                  >
                    <X size={16} />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ol>
        {errors.steps ? <p className="field-error" role="alert">{errors.steps}</p> : null}
      </div>

      <Toggle
        label={t('pt.bookable')}
        hint={t('pt.bookableHint')}
        checked={draft.active}
        onChange={(on) => patch({ active: on })}
      />

      <Button block onClick={submit}>{t('action.save')}</Button>
    </div>
  );
}
