import type { ReactNode } from 'react';
import { useT } from '../../hooks/useLanguage';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description,
  confirmLabel, cancelLabel, tone = 'primary', loading, icon, children,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      dismissible={!loading}
      footer={
        <>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} block loading={loading} onClick={onConfirm}>
            {confirmLabel ?? t('confirm.confirm')}
          </Button>
          <Button variant="ghost" block onClick={onClose} disabled={loading}>
            {cancelLabel ?? t('confirm.keepIt')}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
