import { FileText, History, KeyRound, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { APP_VERSION, ROUTES } from '../../constants';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { LogoutButton } from '../../components/profile/LogoutButton';
import { PaymentAccountsSection } from '../../components/profile/PaymentAccountsSection';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { formatNumber } from '../../utils/format';
import { photoStore } from '../../utils/storage';

type Dialog = 'clear' | null;

export default function SettingsPage() {
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);
  const generations = useAppStore((s) => s.generations);
  const clearGenerations = useAppStore((s) => s.clearGenerations);
  const toast = useAppStore((s) => s.toast);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const resultCount = formatNumber(generations.length);

  const clearHistory = async () => {
    setBusy(true);
    try {
      await photoStore.clear();
    } finally {
      clearGenerations();
      setBusy(false);
      setDialog(null);
      toast('success', t('settings.historyCleared'));
    }
  };

  return (
    <Screen nav>
      <Header title={t('profile.settingsTitle')} back backTo={ROUTES.profile} />
      <ScreenBody className="pf-screen pf-settings stagger">
        <section className="section" aria-labelledby="pf-account">
          <h3 className="label" id="pf-account">{t('settings.account')}</h3>
          <ListCard className="pf-list">
            <ListRow
              icon={<KeyRound size={18} aria-hidden="true" />}
              title={t('auth.changePasswordTitle')}
              sub={t('settings.changePasswordHint')}
              to={ROUTES.changePassword}
            />
          </ListCard>
        </section>

        {/* No salon, language or appearance section here: all three live in
            Home's header (`SalonSwitchButton`, `LanguageSwitchButton`,
            `ThemeSwitchButton`). */}
        <section className="section" aria-labelledby="pf-notifications">
          <h3 className="label" id="pf-notifications">{t('settings.notifications')}</h3>
          <ListCard>
            <div className="list-row pf-toggle-row">
              <Toggle
                label={t('settings.smsReminders')}
                hint={t('settings.smsRemindersHint')}
                checked={preferences.smsReminders}
                onChange={(on) => setPreference('smsReminders', on)}
              />
            </div>
            <div className="list-row pf-toggle-row">
              <Toggle
                label={t('settings.bookingUpdates')}
                hint={t('settings.bookingUpdatesHint')}
                checked={preferences.bookingUpdates}
                onChange={(on) => setPreference('bookingUpdates', on)}
              />
            </div>
          </ListCard>
        </section>

        <section className="section" aria-labelledby="pf-privacy">
          <h3 className="label" id="pf-privacy">{t('settings.privacy')}</h3>
          <ListCard className="pf-list">
            <div className="list-row pf-toggle-row">
              <Toggle
                label={t('settings.saveResults')}
                hint={t('settings.saveResultsHint')}
                checked={preferences.saveHistory}
                onChange={(on) => setPreference('saveHistory', on)}
              />
            </div>
            {/* Only a button when there is something to clear — with nothing
                saved it is a plain row saying so, not a way into a confirm
                dialog that would delete nothing. */}
            <ListRow
              icon={<History size={18} aria-hidden="true" />}
              title={t('settings.clearHistory')}
              sub={generations.length ? t('settings.results', { count: resultCount }) : t('settings.nothingSaved')}
              onClick={generations.length ? () => setDialog('clear') : undefined}
            />
          </ListCard>
        </section>

        <PaymentAccountsSection />

        <section className="section" aria-labelledby="pf-about">
          <h3 className="label" id="pf-about">{t('settings.about')}</h3>
          <ListCard className="pf-list">
            <ListRow icon={<Shield size={18} aria-hidden="true" />} title={t('settings.version')} end={APP_VERSION} />
            {/* In the app rather than out of it: these used to be `href="#"`,
                which opened a blank tab. */}
            <ListRow icon={<FileText size={18} aria-hidden="true" />} title={t('settings.terms')} to={ROUTES.terms} />
            <ListRow icon={<FileText size={18} aria-hidden="true" />} title={t('settings.privacyPolicy')} to={ROUTES.privacy} />
          </ListCard>
        </section>

        <LogoutButton />
      </ScreenBody>

      <ConfirmDialog
        open={dialog === 'clear'}
        onClose={() => setDialog(null)}
        onConfirm={clearHistory}
        tone="danger"
        loading={busy}
        title={t('settings.clearConfirmTitle')}
        description={
          generations.length
            ? t('settings.clearConfirmBody', { count: resultCount })
            : t('settings.clearConfirmBodyAll')
        }
        confirmLabel={t('settings.clearConfirmAction')}
        icon={<span className="icon-circle icon-circle-danger"><Trash2 size={22} aria-hidden="true" /></span>}
      />
    </Screen>
  );
}
