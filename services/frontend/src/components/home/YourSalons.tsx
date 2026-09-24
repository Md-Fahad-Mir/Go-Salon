import { AlertTriangle, ChevronRight, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';

/* The salons a customer can book at, and the way in to booking one.

   NOT the same component as `SalonSection`, and deliberately so. That one is
   a picker: radio rows, one of them ticked, choosing which salon the app is
   *acting in*. This one is a launcher: every row goes somewhere, nothing is
   selected, and tapping does not change the app's context at all. Sharing a
   component would mean one file doing both jobs behind a flag, with two sets
   of ARIA semantics — a radio that is sometimes a link. They share the
   visual language instead, because both are built from `list-card`,
   `list-row` and `Avatar` like every other list in this app.

   No fetch of its own. `loadTenants` already runs on sign-in and on every
   start-up with a stored token, so this reads what is there — which is also
   why there is no spinner: an account with salons has them persisted from
   last time, and one without would get a flash that resolves to nothing.
   The same reasoning, and the same `tenantsStatus`, as the switcher. */
export function YourSalons() {
  const t = useT();
  const tenants = useAppStore((s) => s.tenants);
  const status = useAppStore((s) => s.tenantsStatus);
  const loadTenants = useAppStore((s) => s.loadTenants);

  if (status === 'error' && tenants.length === 0) {
    return (
      <section className="section home-section" aria-labelledby="home-salons">
        <h2 id="home-salons">{t('tenant.homeTitle')}</h2>
        <EmptyState
          icon={<AlertTriangle size={26} aria-hidden="true" />}
          tone="danger"
          title={t('tenant.errListTitle')}
          description={t('tenant.errListBody')}
          action={<Button onClick={() => void loadTenants()}>{t('state.retry')}</Button>}
        />
      </section>
    );
  }

  if (tenants.length === 0) {
    return (
      <section className="section home-section" aria-labelledby="home-salons">
        <h2 id="home-salons">{t('tenant.homeTitle')}</h2>
        {/* Where F3b's scanner button belongs once it exists. Until then this
            says what to do rather than offering a control that is not built,
            and it deliberately links nowhere: the only other place it could
            point is the search screen, which no longer works for a salon
            somebody has not joined. */}
        <EmptyState
          icon={<QrCode size={26} aria-hidden="true" />}
          tone="accent"
          title={t('tenant.homeEmptyTitle')}
          description={t('tenant.homeEmptyBody')}
        />
      </section>
    );
  }

  return (
    <section className="section home-section" aria-labelledby="home-salons">
      <h2 id="home-salons">{t('tenant.homeTitle')}</h2>
      <div className="list-card">
        {tenants.map((salon) => (
          <Link
            key={salon.id}
            /* The booking wizard is addressed by listing id — `salon-3` — not
               by tenant id, and the two are different numbers. `listingId`
               comes down with the salon for exactly this reason; it cannot be
               derived from the slug, which is made from the name. */
            to={ROUTES.bookingService(salon.listingId)}
            className="list-row"
            aria-label={t('tenant.bookAt', { name: salon.name })}
          >
            <span className="list-row-icon">
              <Avatar name={salon.name} src={salon.avatar || undefined} size="sm" />
            </span>
            <span className="list-row-body">
              <span className="list-row-title">{salon.name}</span>
            </span>
            <span className="list-row-end">
              <ChevronRight size={18} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      <p className="small muted">{t('tenant.homeHint')}</p>
    </section>
  );
}
