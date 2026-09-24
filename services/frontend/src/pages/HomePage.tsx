import { AlertTriangle, ChevronRight, QrCode } from 'lucide-react';
import { Avatar } from '../components/common/Avatar';
import { Button, LinkButton } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { HomeFrame } from '../components/home/HomeFrame';
import { SalonProfile } from '../components/salon/SalonProfile';
import { ROUTES } from '../constants';
import { useT } from '../hooks/useLanguage';
import { useAppStore } from '../store/useAppStore';

/* Home is the salon the customer is in.

   Not a list of salons, and not a feed of things to try on: the profile of
   whichever salon is active — its room, its menu, its team, and the button
   that books — rendered by the same `SalonProfile` that `/professional/:id`
   uses, so there is one salon screen in this app and Home is it. Which salon
   that is comes from the store's `activeTenantId`, the same fact every request
   already puts in `X-Tenant-Id`, so what Home shows and what Booking is scoped
   to cannot disagree.

   When there is no salon to show, Home says which of these it is rather than
   collapsing them:

     not known yet      the list is still being read — which is every fresh
                        sign-in, because `setSession` empties it for the
                        server to refill. Waiting, not "no salons": a customer
                        with three salons must not be told they have none.
     could not be read  a failure, with a retry; never mistaken for an empty
                        account.
     none at all        the way to one. The scanner lives in Settings, so this
                        points there rather than opening the camera.
     several, none      also every fresh sign-in, for a multi-salon customer
     chosen             (`reconcileTenant` only picks for an account with
                        one). Nothing here guesses either: they are asked.

   SUBSCRIBED AS PRIMITIVES, and worth saying. No screen whose data depends on
   the salon re-rendered on `activeTenantId` before this one — the switcher in
   Settings subscribes only to draw its tick, then navigates away, and every
   other screen re-reads the id at request time. `activeTenant()` on the store
   is a getter with a stable identity, so selecting it would never re-render;
   the fields below are selected one by one so that a switch, a join, or a
   removal is reflected here without a navigation. `key` on the profile makes
   a switch a fresh mount rather than one salon's open lightbox or hours table
   carried over onto another salon's page.

   No fetch of its own. `loadTenants` runs on sign-in and on every start-up
   with a stored token, so this reads what is there. */
export default function HomePage() {
  const t = useT();
  const tenants = useAppStore((s) => s.tenants);
  const activeTenantId = useAppStore((s) => s.activeTenantId);
  const status = useAppStore((s) => s.tenantsStatus);
  const setActiveTenant = useAppStore((s) => s.setActiveTenant);
  const loadTenants = useAppStore((s) => s.loadTenants);

  const active = activeTenantId === null ? undefined : tenants.find((salon) => salon.id === activeTenantId);

  if (active?.listingId) {
    return <SalonProfile key={active.listingId} listingId={active.listingId} home />;
  }

  // `idle` is the moment between a sign-in and the request it sets off.
  const unsettled = status === 'idle' || status === 'loading';

  const waiting = (
    <HomeFrame center>
      <Spinner size="lg" label={t('state.loading')} />
    </HomeFrame>
  );

  const unreadable = (
    <HomeFrame center>
      <EmptyState
        icon={<AlertTriangle size={26} aria-hidden="true" />}
        tone="danger"
        title={t('tenant.errListTitle')}
        description={t('tenant.errListBody')}
        action={<Button onClick={() => void loadTenants()}>{t('state.retry')}</Button>}
      />
    </HomeFrame>
  );

  if (tenants.length === 0) {
    if (status === 'error') return unreadable;
    if (unsettled) return waiting;
    return (
      <HomeFrame center>
        <EmptyState
          icon={<QrCode size={26} aria-hidden="true" />}
          tone="accent"
          title={t('tenant.homeEmptyTitle')}
          description={t('tenant.homeEmptyBody')}
          action={<LinkButton to={ROUTES.profileSettings}>{t('tenant.homeEmptyAction')}</LinkButton>}
        />
      </HomeFrame>
    );
  }

  /* A salon is chosen but has no listing id to open it by. A list persisted
     by a build older than `listingId`, which the refresh under way will
     replace — or, if the refresh is done, a tenant the server could not name
     a business for. Either way the picker would be wrong here: it would list
     the chosen salon as unchosen, and tapping it would change nothing. */
  if (active) return unsettled ? waiting : unreadable;

  /* Several salons and none chosen. Plain buttons rather than the switcher's
     radio rows: nothing here is selected yet, so there is no "checked" state
     to announce, and tapping one is an action, not a setting. */
  return (
    <HomeFrame>
      <section className="section home-section" aria-labelledby="home-pick">
        <h2 id="home-pick">{t('tenant.homePickTitle')}</h2>
        <p className="caption">{t('tenant.homePickBody')}</p>
        <div className="list-card">
          {tenants.map((salon) => (
            <button
              key={salon.id}
              type="button"
              className="list-row"
              onClick={() => setActiveTenant(salon.id)}
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
            </button>
          ))}
        </div>
      </section>
    </HomeFrame>
  );
}
