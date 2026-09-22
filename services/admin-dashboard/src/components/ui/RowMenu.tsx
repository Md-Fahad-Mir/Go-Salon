import { useCallback, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useClickOutside, useEscapeKey } from '../../hooks/useUi';

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

/** Overflow menu — the only action affordance on narrow screens, and the
    home for secondary actions everywhere else. */
export function RowMenu({ items, label = 'Row actions' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(open, close);
  useEscapeKey(open, close);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="menu" role="menu">
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore ? <hr /> : null}
              <button
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : undefined}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
