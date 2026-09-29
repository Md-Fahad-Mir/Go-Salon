import { Check, QrCode, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tenant } from '../../types';
import { HOME_ROUTE_FOR, ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { Avatar } from '../common/Avatar';
import { BottomSheet } from '../common/BottomSheet';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { IconButton } from '../common/IconButton';
import { ListCard, ListRow } from '../common/ListRow';

interface SalonSwitchButtonProps {
  variant?: 'plain' | 'scrim';
}

/** The trigger in Home's header is the active salon's own avatar — tap it,
    the way a Gmail avatar opens its account switcher, and every salon on the
    account comes up as a list. A list rather than a strip, because salon
    names are long ("Menz Crown Premium Salon") and a strip can only show
    them cut off. Every row has a second line so the names all sit at the
    same height.

    This is the customer's only way to add, switch or remove a salon — none of
    it is in Settings — so it shows even for a single salon: there is nothing
    to switch to yet, but there is one to add and one to remove. */
export function SalonSwitchButton({ variant = 'plain' }: SalonSwitchButtonProps) {
  const t = useT();
  const navigate = useNavigate();
  const tenants = useAppStore((s) => s.tenants);
  const activeTenantId = useAppStore((s) => s.activeTenantId);
  const setActiveTenant = useAppStore((s) => s.setActiveTenant);
  const removeTenant = useAppStore((s) => s.removeTenant);
  const role = useAppStore((s) => s.user?.role) ?? 'customer';
  const toast = useAppStore((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState<Tenant | null>(null);
  const [busy, setBusy] = useState(false);

  const active = tenants.find((salon) => salon.id === activeTenantId);

  // Nothing to switch from yet — the page's own picker handles "several,
  // none chosen", and its empty state handles "none at all", better than a
  // header button whose own avatar would be blank.
  if (!active) return null;

  // Only a customer joined anything, so only a customer can leave — the same
  // rule `SalonSection` follows.
  const mayLeave = role === 'customer';

  const choose = (id: number) => {
    setOpen(false);
    if (id === activeTenantId) return;
    setActiveTenant(id);
    navigate(HOME_ROUTE_FOR[role] ?? ROUTES.home, { replace: true });
  };

  const addSalon = () => {
    setOpen(false);
    navigate(ROUTES.joinScan);
  };

  const leave = async () => {
    if (!leaving) return;
    setBusy(true);
    const name = leaving.name;
    const ok = await removeTenant(leaving.id);
    setBusy(false);
    setLeaving(null);
    if (ok) toast('info', t('tenant.removed', { name }));
    else toast('error', t('tenant.errRemove'));
  };

  return (
    <>
      <button
        type="button"
        className="home-avatar-link"
        data-scrim={variant === 'scrim' ? 'true' : undefined}
        onClick={() => setOpen(true)}
        aria-label={t('tenant.switchAction')}
      >
        <Avatar name={active.name} src={active.avatar || undefined} size="sm" ring />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('tenant.switchAction')} description={t('tenant.switchHint')}>
        <div className="stack">
          <div className="list-card" role="radiogroup" aria-label={t('tenant.switchAction')}>
            {tenants.map((salon) => {
              const isActive = salon.id === activeTenantId;
              return (
                <div key={salon.id} className="list-row tenant-switch-row" data-active={isActive ? 'true' : undefined}>
                  <button
                    type="button"
                    className="tenant-switch-pick"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => choose(salon.id)}
                  >
                    <Avatar name={salon.name} src={salon.avatar || undefined} size="md" ring={isActive} />
                    <span className="list-row-body">
                      <span className="list-row-title">{salon.name}</span>
                      <span className="list-row-sub">
                        {isActive ? t('tenant.switchActive') : t('tenant.switchTap')}
                      </span>
                    </span>
                    {isActive ? <Check size={20} aria-hidden="true" className="tenant-switch-check" /> : null}
                  </button>
                  {mayLeave ? (
                    <IconButton
                      label={t('tenant.removeTitle', { name: salon.name })}
                      className="tenant-switch-remove"
                      onClick={() => setLeaving(salon)}
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  ) : null}
                </div>
              );
            })}
          </div>

          <ListCard>
            <ListRow
              icon={<QrCode size={18} aria-hidden="true" />}
              title={t('tenant.scanAddSalon')}
              sub={t('tenant.scanRow')}
              onClick={addSalon}
            />
          </ListCard>
        </div>
      </BottomSheet>

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
    </>
  );
}
