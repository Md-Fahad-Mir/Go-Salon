import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionSheet } from '../common/ActionSheet';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { ListRow } from '../common/ListRow';
import type { Tenant } from '../../types';
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

   Two roles can have more than one salon — a customer who has scanned
   several codes, and an owner who registered several shops. Everybody else
   has exactly one, guaranteed by the schema rather than by convention: a
   barber's profile is one-to-one with their account, and a stylist's active
   employment is bounded by a partial unique index. They never see this.

   The threshold differs by role, and it moved for customers when leaving a
   salon arrived. An owner needs two shops before there is anything to do
   here: a single salon is not a choice, and there is no leaving one you own.
   A customer with a single salon has nothing to switch between either — the
   backend resolves a sole tenant from the account anyway — but they can still
   want to leave it, and a section that hid itself would be a feature with no
   door. So: owners at two, customers at one, nobody at zero.

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
  const removeTenant = useAppStore((s) => s.removeTenant);
  const toast = useAppStore((s) => s.toast);

  const [picking, setPicking] = useState(false);
  const [leaving, setLeaving] = useState<Tenant | null>(null);
  const [busy, setBusy] = useState(false);

  const mayHaveSeveral = role === 'customer' || role === 'salon_owner';
  // Only a customer joined anything, so only a customer can leave. The
  // endpoint says the same — there is no owner equivalent, because a shop is
  // not something its owner is a member of.
  const mayLeave = role === 'customer';

  /* A failed read is shown even though we cannot know what it would have
     found — which is exactly why. Staying silent would leave an owner of
     three salons looking at a settings screen with no salon on it and no way
     to ask again. The copy says the app is still on its last list, because
     that is true: `loadTenants` leaves the previous one in place. */
  if (!mayHaveSeveral) return null;

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

  if (tenants.length < (mayLeave ? 1 : 2)) return null;

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

  /* Leaving is deliberately not a control on the salon's own row.

     The row is the switch, and it is the thing people touch often; leaving is
     rare and cannot be undone by touching it again. The project already has a
     shape for this — `PaymentAccountsSection` keeps its destructive action
     behind a sheet rather than beside the item — so this follows it: one
     trailing row opens a sheet listing the salons, and choosing one still has
     to get past a confirm. Two deliberate taps before anything is asked of
     the server, and the frequent action stays at one. */
  const leave = async () => {
    if (!leaving) return;
    setBusy(true);
    const name = leaving.name;
    const ok = await removeTenant(leaving.id);
    setBusy(false);
    setLeaving(null);
    // No redirect, on purpose — see the note on `choose` above. Removing a
    // salon is tidying, not a request to be taken anywhere, and this screen
    // is not about any salon in particular, so nothing on it has become
    // wrong. The list re-renders in place: the tick moves to whichever salon
    // the reconcile settled on, or the section disappears entirely.
    if (ok) toast('info', t('tenant.removed', { name }));
    else toast('error', t('tenant.errRemove'));
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
        {mayLeave ? (
          <ListRow
            icon={<Trash2 size={18} aria-hidden="true" />}
            title={t('tenant.manage')}
            onClick={() => setPicking(true)}
          />
        ) : null}
      </div>
      <p className="small muted">{t('tenant.switchHint')}</p>

      <ActionSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t('tenant.manageTitle')}
        actions={tenants.map((salon) => ({
          label: salon.name,
          icon: <Trash2 size={18} aria-hidden="true" />,
          danger: true,
          onSelect: () => setLeaving(salon),
        }))}
      />

      <ConfirmDialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        onConfirm={() => void leave()}
        title={leaving ? t('tenant.removeTitle', { name: leaving.name }) : ''}
        description={t('tenant.removeBody')}
        confirmLabel={t('profile.remove')}
        tone="danger"
        loading={busy}
        icon={
          <span className="icon-circle icon-circle-danger">
            <Trash2 size={24} aria-hidden="true" />
          </span>
        }
      />
    </section>
  );
}
