import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Toggle } from '../ui/Toggle';

interface SettingsCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}

/** One themed group of settings: an icon, a title saying what it governs,
    and its rows. */
export function SettingsCard({ icon: Icon, title, description, children }: SettingsCardProps) {
  const id = useId();
  return (
    <section className="card set-card" aria-labelledby={id}>
      <header className="set-card-head">
        <span className="icon-tile" aria-hidden="true">
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <div className="set-card-titles">
          <h3 id={id}>{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      <div className="set-card-body">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  hint?: ReactNode;
  /** The control takes the full width under its label — for choices that
      are sentences, not words. */
  stacked?: boolean;
  children: ReactNode;
  /** Anything that belongs to the row but not beside its control. */
  after?: ReactNode;
}

export function SettingRow({ label, hint, stacked = false, children, after }: SettingRowProps) {
  return (
    <div className={cn('setting-row', stacked && 'setting-row-stacked')}>
      <div className="info">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="control">{children}</div>
      {after}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({ label, hint, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <SettingRow label={label} hint={hint}>
      <Toggle checked={checked} hideLabel label={label} disabled={disabled} onChange={onChange} />
    </SettingRow>
  );
}
