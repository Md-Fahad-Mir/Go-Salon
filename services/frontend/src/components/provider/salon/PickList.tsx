import { Checkbox } from '../../common/Checkbox';
import { useT } from '../../../hooks/useLanguage';
import { formatNumber } from '../../../utils/format';

export interface PickOption {
  id: string;
  label: string;
  hint?: string;
}

interface PickListProps {
  label: string;
  options: PickOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Shown in place of the list when there is nothing to tick. */
  emptyLabel: string;
  error?: string;
}

/** A scrolling checklist inside a sheet — who may perform a service, which
    services one stylist is cleared for. Both directions of the same question,
    so both use this. */
export function PickList({ label, options, selected, onChange, emptyLabel, error }: PickListProps) {
  const t = useT();
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">{label}</legend>
      {options.length ? (
        <div className="ps-checklist">
          {options.map((option) => (
            <Checkbox
              key={option.id}
              checked={selected.includes(option.id)}
              onChange={() => toggle(option.id)}
              label={option.label}
              hint={option.hint}
            />
          ))}
        </div>
      ) : (
        <p className="field-hint">{emptyLabel}</p>
      )}
      <p className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
        {error ?? (selected.length ? t('salon.selectedCount', { count: formatNumber(selected.length) }) : t('salon.noneChosen'))}
      </p>
    </fieldset>
  );
}
