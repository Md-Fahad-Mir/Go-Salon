import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useLanguage';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface LogoutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LogoutDialog({ open, onClose }: LogoutDialogProps) {
  const { logout } = useAuth();
  const t = useT();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => void logout()}
      tone="danger"
      title={t('profile.logOutTitle')}
      description={t('profile.logOutBody')}
      confirmLabel={t('profile.logOut')}
      cancelLabel={t('profile.staySignedIn')}
      icon={<span className="icon-circle icon-circle-danger"><LogOut size={22} aria-hidden="true" /></span>}
    />
  );
}
