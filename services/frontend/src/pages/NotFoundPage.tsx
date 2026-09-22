import { Compass } from 'lucide-react';
import { LinkButton } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { useT } from '../hooks/useLanguage';

export default function NotFoundPage() {
  const t = useT();
  return (
    <Screen className="pf-lost">
      <ScreenBody className="fullscreen-center">
        <EmptyState
          icon={<Compass size={28} aria-hidden="true" />}
          tone="accent"
          title={t('error.notFound')}
          description={t('error.notFoundBody')}
          action={<LinkButton to="/">{t('action.backToHome')}</LinkButton>}
        />
      </ScreenBody>
    </Screen>
  );
}
