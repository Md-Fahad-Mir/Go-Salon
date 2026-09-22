import { formatNumber } from '../../utils/format';

interface TabsProps<T extends string> {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, label }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="count">{formatNumber(tab.count)}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ tabs, active, onChange, label }: TabsProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" aria-pressed={active === tab.id} onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.count !== undefined ? <span className="count dim"> {formatNumber(tab.count)}</span> : null}
        </button>
      ))}
    </div>
  );
}
