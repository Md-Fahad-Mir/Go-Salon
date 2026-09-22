import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Callout } from '../components/common/Callout';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { LogoutButton } from '../components/profile/LogoutButton';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../hooks/useLanguage';
import { BASE_URL } from '../utils/apiClient';

/** Where an administrator lands.

    Admin accounts are made and used on the backend's own admin site — there
    is no admin app here, and inventing one would be pretending. This says
    where the tools are and gets out of the way. */
export default function AdminHomePage() {
  const t = useT();
  const { user } = useAuth();
  const adminUrl = `${BASE_URL.replace(/\/api\/?$/, '')}/admin/`;

  return (
    <Screen>
      <Header title={t('auth.adminTitle')} />
      <ScreenBody className="auth-body">
        <div className="auth-done">
          <span className="icon-circle" aria-hidden="true"><ShieldCheck size={26} /></span>
          <h2>{user?.name}</h2>
          <p className="caption">{t('auth.adminBody')}</p>
        </div>

        <Callout tone="info">{user?.phone}</Callout>

        <div className="stack-sm">
          <Button
            block
            size="lg"
            icon={<ExternalLink size={18} aria-hidden="true" />}
            onClick={() => window.open(adminUrl, '_blank', 'noopener')}
          >
            {t('auth.adminOpenConsole')}
          </Button>
          <LogoutButton />
        </div>
      </ScreenBody>
    </Screen>
  );
}
