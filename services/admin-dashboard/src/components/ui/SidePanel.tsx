import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEscapeKey, useFocusTrap, useLockBodyScroll } from '../../hooks/useUi';

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Right-hand detail drawer used for profiles and record inspection. */
export function SidePanel({ open, onClose, title, subtitle, children, footer }: SidePanelProps) {
  useEscapeKey(open, onClose);
  useLockBodyScroll(open);
  const ref = useFocusTrap<HTMLElement>(open);

  if (!open) return null;

  return createPortal(
    <div
      className="panel-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside ref={ref} className="panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="truncate">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
