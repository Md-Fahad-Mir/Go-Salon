import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useEscapeKey, useFocusTrap, useLockBodyScroll } from '../../hooks/useUi';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Set false for flows that must finish (e.g. a payment in progress). */
  dismissible?: boolean;
}

/** Centred dialog for confirmations and short decisions. */
export function Modal({ open, onClose, title, description, icon, children, footer, dismissible = true }: ModalProps) {
  const close = dismissible ? onClose : () => undefined;
  useEscapeKey(open, close);
  useLockBodyScroll(open);
  const ref = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
        <div className="modal-head">
          {icon}
          <h2 id="modal-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
