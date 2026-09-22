import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import { Button } from '../common/Button';
import { LogoutDialog } from './LogoutDialog';

/** Signing out, wherever an account screen ends.

    Every role finishes its own screen with this same button — a customer's
    profile, a barber's, a salon owner's, an employee's — so sign-out looks
    and behaves the same whoever is looking at it. It carries its own confirm
    dialog so no screen has to wire one up, and the work itself stays in
    `useAuth().logout`: there is one sign-out, not one per role. */
export function LogoutButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="danger-soft"
        block
        icon={<LogOut size={18} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        {t('profile.logOut')}
      </Button>
      <LogoutDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
