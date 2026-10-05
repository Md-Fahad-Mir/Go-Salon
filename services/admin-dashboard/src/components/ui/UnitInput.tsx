import type { InputHTMLAttributes } from 'react';

interface UnitInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  unit: string;
  /** Currency reads before the amount, a measure after it. */
  placement?: 'prefix' | 'suffix';
}

/** A numeric box with its unit set inside the field, so "৳" or "min" reads
    as part of the value rather than a stray word beside it. Every other prop
    — `id` and the aria attributes `Field` adds included — goes to the input. */
export function UnitInput({ unit, placement = 'suffix', ...input }: UnitInputProps) {
  const affix = (
    <span className="unit-input-unit" aria-hidden="true">
      {unit}
    </span>
  );
  return (
    <div className="unit-input" data-placement={placement} data-disabled={input.disabled ? 'true' : undefined}>
      {placement === 'prefix' ? affix : null}
      <input {...input} />
      {placement === 'suffix' ? affix : null}
    </div>
  );
}
