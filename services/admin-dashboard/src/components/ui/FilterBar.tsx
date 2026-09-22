import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { SearchBar } from './SearchBar';

export interface FilterControl {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface ActiveChip {
  key: string;
  label: string;
  onClear: () => void;
}

interface FilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  controls?: FilterControl[];
  values: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  chips: ActiveChip[];
  onClearAll: () => void;
  trailing?: ReactNode;
}

/** Search + selects + active-filter chips. On phones the selects collapse
    behind a Filters button so the search box keeps the full width. */
export function FilterBar({
  query,
  onQueryChange,
  placeholder = 'Search…',
  controls = [],
  values,
  onFilterChange,
  chips,
  onClearAll,
  trailing,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="filters">
      <div className="filters-main">
        <SearchBar value={query} onChange={onQueryChange} placeholder={placeholder} />
        {controls.length ? (
          <button
            type="button"
            className="btn btn-secondary filters-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <SlidersHorizontal size={15} />
            Filters
            {chips.length ? <span className="badge badge-accent badge-plain">{chips.length}</span> : null}
          </button>
        ) : null}
      </div>

      {controls.length ? (
        <div className="filters-controls" hidden={!expanded}>
          {controls.map((control) => (
            <label key={control.key}>
              <span className="sr-only">{control.label}</span>
              <select
                className="select"
                value={values[control.key] ?? 'all'}
                onChange={(event) => onFilterChange(control.key, event.target.value)}
              >
                <option value="all">{control.label}: all</option>
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {control.label}: {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      {trailing}

      {chips.length ? (
        <div className="chips" style={{ flexBasis: '100%' }}>
          {chips.map((chip) => (
            <span className="chip" key={chip.key}>
              {chip.label}
              <button type="button" onClick={chip.onClear} aria-label={`Remove filter ${chip.label}`}>
                <X size={12} />
              </button>
            </span>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClearAll}>
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
