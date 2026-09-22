import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info } as const;

export function Toaster() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  const t = useT();

  if (!toasts.length) return null;

  return (
    <div className="toaster" role="region" aria-label={t('a11y.notifications')}>
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <output key={toast.id} className={`toast toast-${toast.tone}`}>
            <Icon size={18} className="toast-icon" aria-hidden="true" />
            <div className="toast-body">
              <p className="toast-title">{toast.title}</p>
              {toast.message ? <p className="toast-msg">{toast.message}</p> : null}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label={t('a11y.dismiss')}>
              <X size={14} />
            </button>
          </output>
        );
      })}
    </div>
  );
}
