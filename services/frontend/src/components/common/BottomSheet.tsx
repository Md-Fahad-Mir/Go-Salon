import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useT } from '../../hooks/useLanguage';
import { useEscapeKey, useFocusTrap, useLockBodyScroll } from '../../hooks/useUi';
import { IconButton } from './IconButton';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeButton?: boolean;
  dismissible?: boolean;
}

/** Slides up from the bottom; the mobile home for pickers and secondary flows. */
export function BottomSheet({ open, onClose, title, description, children, footer, closeButton = true, dismissible = true }: BottomSheetProps) {
  const t = useT();
  const close = dismissible ? onClose : () => undefined;
  useEscapeKey(open, close);
  useLockBodyScroll(open);
  const ref = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  return createPortal(
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={title ?? 'Sheet'} tabIndex={-1}>
        <span className="sheet-handle" aria-hidden="true" />
        {title || closeButton ? (
          <div className="sheet-head">
            <div>
              {title ? <h2>{title}</h2> : null}
              {description ? <p>{description}</p> : null}
            </div>
            {closeButton && dismissible ? (
              <IconButton label={t('action.close')} onClick={onClose}><X size={20} /></IconButton>
            ) : null}
          </div>
        ) : null}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
