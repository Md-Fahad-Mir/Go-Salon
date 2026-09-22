import { KeyRound } from 'lucide-react';
import { ROUTES } from '../../constants';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { AppearanceSection } from '../../components/profile/AppearanceSection';
import { LanguageSection } from '../../components/profile/LanguageSection';
import { LogoutButton } from '../../components/profile/LogoutButton';
import { useT } from '../../hooks/useLanguage';

/** The app's own business, and only that.
 *
 *  Language, appearance, the password and signing out are what is here because
 *  they belong to the *app* and to the account rather than to the salon or to
 *  the person's work. A stylist's diary, a salon's takings and a price list are
 *  their owner's, and are reached from the portfolio that owns them — putting
 *  them here would make Settings a drawer for whatever had nowhere else to go.
 *
 *  The password row points at /profile/password, which App.tsx deliberately
 *  keeps outside the customer-only block because the screen is the same one
 *  whatever the role. It was reachable by every account all along and only the
 *  customer had a way in; this is that way in, for the other three.
 */
export default function ProSettingsPage() {
  const t = useT();

  return (
    <Screen nav>
      <Header title={t('nav.settings')} />
      {/* The customer's Settings markup exactly: the same wrapper classes, the
          same chapter heads, the same ListCard rows — so the same design rules
          apply, mirrored onto this role's scope in profile.css. */}
      <ScreenBody className="pf-screen pf-settings stagger">
        <section className="section" aria-labelledby="pro-settings-account">
          <h3 className="label" id="pro-settings-account">{t('settings.account')}</h3>
          <ListCard className="pf-list">
            <ListRow
              icon={<KeyRound size={18} aria-hidden="true" />}
              title={t('auth.changePasswordTitle')}
              sub={t('settings.changePasswordHint')}
              to={ROUTES.changePassword}
            />
          </ListCard>
        </section>

        <LanguageSection />
        <AppearanceSection />

        <LogoutButton />
        <p className="pf-version">{t('profile.appVersion')}</p>
      </ScreenBody>
    </Screen>
  );
}
