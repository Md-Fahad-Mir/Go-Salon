import { AlertTriangle, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { HOME_ROUTE_FOR, ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';

/* Which salon the app is acting in.

   The same shape as `LanguageSection` on purpose — a labelled section holding
   a `list-card` of radio rows with a tick on the chosen one — because it is
   the same kind of control: one account-level setting, pick one of a few. A
   bottom sheet would have been a second pattern for a job this project
   already has one for.

   WHEN IT RENDERS, AND WHEN IT DOES NOT

   Only when there is a choice to make. Two roles can have more than one
   salon — a customer who has scanned several codes, and an owner who
   registered several shops — and everybody else has exactly one, guaranteed
   by the schema rather than by convention: a barber's profile is one-to-one
   with their account, and a stylist's active employment is bounded by a
   partial unique index. For them, and for anyone whose list has a single
   entry, a picker would be a control that cannot change anything.

   A list of one is also not merely useless but slightly wrong: the backend
   resolves a sole tenant from the account when no `X-Tenant-Id` is sent, so
   the "choice" is already made and cannot be unmade.

   There is deliberately no spinner. An account with a salon list has it
   persisted from last time, so a refresh has something to show throughout;
   an account without one would get a spinner that resolves to nothing, which
   is a flash of furniture for the majority case. The failure is worth saying
   out loud, though — see below.
*/
export function SalonSection() {
  const t = useT();
  const navigate = useNavigate();

  // One primitive per selector: zustand v5 compares by identity, so an object
  // selector would re-render this on every unrelated write to the store.
  const tenants = useAppStore((s) => s.tenants);
  const activeTenantId = useAppStore((s) => s.activeTenantId);
  const status = useAppStore((s) => s.tenantsStatus);
  const role = useAppStore((s) => s.user?.role) ?? 'customer';
  const setActiveTenant = useAppStore((s) => s.setActiveTenant);
  const loadTenants = useAppStore((s) => s.loadTenants);

  const mayHaveSeveral = role === 'customer' || role === 'salon_owner';
  if (!mayHaveSeveral) return null;

  /* A failed read is shown even though we cannot know what it would have
     found — which is exactly why. Staying silent would leave an owner of
     three salons looking at a settings screen with no salon on it and no way
     to ask again. The copy says the app is still on its last list, because
     that is true: `loadTenants` leaves the previous one in place. */
  if (status === 'error') {
    return (
      <section className="section" aria-labelledby="pf-salon">
        <h3 className="label" id="pf-salon">{t('tenant.switchTitle')}</h3>
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

  if (tenants.length < 2) return null;

  /* Switching leaves the screen the person is on, rather than re-fetching it
     under the new salon.

     The reason is in the URLs. Half this app's routes carry a tenant-scoped
     id — /bookings/:id, /booking/:professionalId/service, /pro/appointment/:id
     — and `scoped()` filters every one of those queries by tenant, so under
     the new salon those ids are 404s. Re-fetching in place would land the
     person on a broken screen holding the previous salon's heading; there is
     no reinterpreting "this booking" as a booking somewhere else.

     The landing route is the one screen guaranteed to mean something under
     any tenant. The cost is that switching from a screen that was not scoped
     at all — this one — also moves, which is a small unnecessary jump. It is
     the right trade: the alternative is a per-route map of what is scoped and
     what is not, kept in step by hand, where being wrong once shows somebody
     another salon's data. */
  const choose = (id: number) => {
    if (id === activeTenantId) return;
    setActiveTenant(id);
    navigate(HOME_ROUTE_FOR[role] ?? ROUTES.home, { replace: true });
  };

  return (
    <section className="section" aria-labelledby="pf-salon">
      <h3 className="label" id="pf-salon">{t('tenant.switchTitle')}</h3>
      <div className="list-card" role="radiogroup" aria-labelledby="pf-salon">
        {tenants.map((salon) => {
          const active = salon.id === activeTenantId;
          return (
            <button
              key={salon.id}
              type="button"
              className="list-row"
              role="radio"
              aria-checked={active}
              onClick={() => choose(salon.id)}
            >
              <span className="list-row-icon">
                <Avatar name={salon.name} src={salon.avatar || undefined} size="sm" />
              </span>
              <span className="list-row-body">
                <span className="list-row-title">{salon.name}</span>
                {active ? (
                  <span className="list-row-sub">{t('tenant.switchActive')}</span>
                ) : null}
              </span>
              <span className="list-row-end">
                {active ? (
                  <Check size={20} aria-hidden="true" style={{ color: 'var(--accent-ink)' }} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="small muted">{t('tenant.switchHint')}</p>
    </section>
  );
}
