import { KeyRound } from 'lucide-react';
import { useId } from 'react';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { ListCard, ListRow } from '../common/ListRow';
import { LogoutButton } from './LogoutButton';

interface AccountSectionProps {
  /** The host screen's own section-head class, so the chapter matches the
      ones above it (`ps-chapter` on the owner's salon profile, say). */
  headClassName?: string;
  /** The host screen's own list class, for the same reason. */
  listClassName?: string;
}

/** The end of a professional's profile: the password, signing out, and the
    version. There is no provider Settings screen — language and light/dark
    are in the home header, and these three are the rest of what it held — so
    every provider profile finishes with this, including while the profile
    itself is loading or failed, since signing out must never depend on it. */
export function AccountSection({ headClassName, listClassName }: AccountSectionProps) {
  const t = useT();
  const headId = useId();
  return (
    <>
      <section className="section" aria-labelledby={headId}>
        <h3 className={`label ${headClassName ?? ''}`.trim()} id={headId}>{t('settings.account')}</h3>
        <ListCard className={listClassName}>
          <ListRow
            icon={<KeyRound size={18} aria-hidden="true" />}
            title={t('auth.changePasswordTitle')}
            sub={t('settings.changePasswordHint')}
            to={ROUTES.changePassword}
          />
        </ListCard>
      </section>
      <LogoutButton />
      <p className="pf-version">{t('profile.appVersion')}</p>
    </>
  );
}
