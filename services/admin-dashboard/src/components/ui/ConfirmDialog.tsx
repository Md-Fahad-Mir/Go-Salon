import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: '2.25rem',
            height: '2.25rem',
            flexShrink: 0,
            borderRadius: '50%',
            backgroundColor: 'var(--status-danger-bg)',
            color: 'var(--status-danger-ink)',
          }}
        >
          <AlertTriangle size={18} />
        </span>
        <p style={{ margin: 0 }}>{message}</p>
      </div>
    </Modal>
  );
}
