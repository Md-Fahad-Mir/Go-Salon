import { BrandMark } from '../components/auth/BrandMark';
import { Art } from '../components/common/Art';
import { LinkButton } from '../components/common/Button';
import { Screen } from '../components/layout/Screen';
import { ROUTES } from '../constants';
import { useT } from '../hooks/useLanguage';

/** The splash: a full-bleed cover, the promise, and two ways in. */
export default function WelcomePage() {
  const t = useT();
  return (
    <Screen>
      <div className="auth-welcome">
        <Art tone={0} ratio="none" flat className="auth-welcome-art" alt={t('auth.welcomeArtAlt')}>
          <div className="art-overlay auth-welcome-overlay">
            <BrandMark size="xl" />
          </div>
        </Art>

        <div className="auth-welcome-body">
          <div className="stack-sm">
            <h1 className="display">{t('app.tagline')}</h1>
            <p className="auth-welcome-sub">{t('auth.welcomeSub')}</p>
          </div>

          <div className="stack-sm">
            <LinkButton to={ROUTES.register} block size="lg">
              {t('auth.getStarted')}
            </LinkButton>
            <LinkButton to={ROUTES.login} variant="ghost" block>
              {t('auth.haveAccount')}
            </LinkButton>
          </div>

          <p className="auth-welcome-foot tiny dim center">{t('auth.welcomeFoot')}</p>
        </div>
      </div>
    </Screen>
  );
}
