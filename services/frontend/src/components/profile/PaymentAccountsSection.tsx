import { MoreHorizontal, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { PaymentAccount } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ActionSheet } from '../common/ActionSheet';
import { Badge } from '../common/Badge';
import { IconButton } from '../common/IconButton';
import { ListCard } from '../common/ListRow';

/** Saved wallets and cards, with make default / remove. */
export function PaymentAccountsSection() {
  const accounts = useAppStore((s) => s.paymentAccounts);
  const setDefaultPaymentAccount = useAppStore((s) => s.setDefaultPaymentAccount);
  const removePaymentAccount = useAppStore((s) => s.removePaymentAccount);
  const toast = useAppStore((s) => s.toast);
  const [menuFor, setMenuFor] = useState<PaymentAccount | null>(null);
  const t = useT();

  if (accounts.length === 0) return null;

  return (
    <section className="section" aria-labelledby="pf-payments">
      <h3 className="label" id="pf-payments">{t('settings.payments')}</h3>
      {/* `pf-card-keep`: a saved wallet or card is a thing a customer owns, not
          a preference, so this one group keeps a body on the settings screen. */}
      <ListCard className="pf-list pf-card-keep">
        {accounts.map((account) => (
          <div key={account.id} className="list-row pf-pay-row">
            <span className="pf-pay-dot" data-method={account.method} aria-hidden="true" />
            <span className="list-row-body">
              <span className="list-row-title">{account.label}</span>
              <span className="list-row-sub">{account.masked}</span>
            </span>
            <span className="list-row-end">
              {account.isDefault ? <Badge tone="accent" plain pill>{t('settings.default')}</Badge> : null}
              <IconButton
                label={t('settings.paymentOptions', { label: account.label, masked: account.masked })}
                onClick={() => setMenuFor(account)}
              >
                <MoreHorizontal size={20} />
              </IconButton>
            </span>
          </div>
        ))}
      </ListCard>

      <ActionSheet
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor ? `${menuFor.label} ${menuFor.masked}` : undefined}
        actions={[
          {
            label: t('settings.makeDefault'),
            icon: <Star size={18} aria-hidden="true" />,
            disabled: menuFor?.isDefault ?? false,
            onSelect: () => {
              if (!menuFor) return;
              setDefaultPaymentAccount(menuFor.id);
              toast('success', t('settings.defaultUpdated'), `${menuFor.label} ${menuFor.masked}`);
            },
          },
          {
            label: t('profile.remove'),
            icon: <Trash2 size={18} aria-hidden="true" />,
            danger: true,
            onSelect: () => {
              if (!menuFor) return;
              removePaymentAccount(menuFor.id);
              toast('info', t('settings.paymentRemoved'), `${menuFor.label} ${menuFor.masked}`);
            },
          },
        ]}
      />
    </section>
  );
}
