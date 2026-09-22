import { Store } from 'lucide-react';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { Button, LinkButton } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';
import { Header } from '../layout/Header';
import { Screen, ScreenBody } from '../layout/Screen';

/** Not-found screen for a professional the directory does not have — a bad id
    in the URL, or a listing that has since been taken down.

    `detail` carries the server's own words when the lookup failed for another
    reason, so a network problem does not read as "this salon is gone". */
export function ProfessionalNotFound({ nav = false, detail }: { nav?: boolean; detail?: string }) {
  const t = useT();
  return (
    <Screen nav={nav}>
      <Header back title={t('biz.salon')} />
      <ScreenBody>
        <EmptyState
          icon={<Store size={26} aria-hidden="true" />}
          title={t('booking.proNotFound')}
          description={detail ?? t('booking.proNotFoundBody')}
          action={<LinkButton to={ROUTES.home} replace>{t('action.backToHome')}</LinkButton>}
        />
      </ScreenBody>
    </Screen>
  );
}

/** Held while a listing is being fetched. */
export function ProfessionalLoading() {
  const t = useT();
  return (
    <Screen nav>
      <Header back title={t('biz.salon')} />
      <ScreenBody>
        <div className="bk-loading" aria-busy="true">
          <Spinner size="lg" label={t('state.loading')} />
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** Brief shell shown while the draft for this step is being prepared. */
export function WizardLoading({ title }: { title: string }) {
  const t = useT();
  return (
    <Screen>
      <Header back title={title} />
      <ScreenBody>
        <div className="bk-loading" aria-busy="true">
          <Spinner size="lg" label={t('booking.preparing')} />
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** Shown when a booking reference in the URL is unknown. */
export function BookingNotFound({ onHome }: { onHome: () => void }) {
  const t = useT();
  return (
    <Screen>
      <Header close title={t('booking.booking')} />
      <ScreenBody>
        <EmptyState
          icon={<Store size={26} aria-hidden="true" />}
          title={t('booking.bookingNotFound')}
          description={t('booking.bookingNotFoundBody')}
          action={<Button onClick={onHome}>{t('action.backToHome')}</Button>}
        />
      </ScreenBody>
    </Screen>
  );
}
