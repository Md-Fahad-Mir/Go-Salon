import { AlertTriangle, Pencil, Plus, UserRound, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLATFORM_COMMISSION, TAKINGS_METHODS, ROUTES } from '../../constants';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { Segmented } from '../../components/common/Tabs';
import { IconButton } from '../../components/common/IconButton';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { MethodDot } from '../../components/provider/business/MethodDot';
import { PayoutSheet } from '../../components/provider/business/PayoutSheet';
import {
  payoutColor,
  payoutLabelKey,
  takingsColor,
  takingsLabelKey,
} from '../../components/provider/business/labels';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { PayoutAccount, TakingsMethod } from '../../types';
import {
  formatBdt,
  formatDayLabel,
  formatNumber,
  formatPattern,
  toDateKey,
} from '../../utils/format';

type Period = 'today' | 'week' | 'month';

/** The three seeded payout accounts in `mockPayoutAccounts` are one per
    provider but are loaded into every provider's store, so the screen keeps
    only the ones that belong to this business. Anything added in-session has a
    generated id and is always kept. */

const dateOf = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function EarningsPage() {
  const t = useT();
  const navigate = useNavigate();
  const earnings = useProviderStore((state) => state.earnings);
  const appointments = useProviderStore((state) => state.appointments);
  const payoutAccounts = useProviderStore((state) => state.payoutAccounts);
  const addPayoutAccount = useProviderStore((state) => state.addPayoutAccount);
  const setDefaultPayoutAccount = useProviderStore((state) => state.setDefaultPayoutAccount);
  const removePayoutAccount = useProviderStore((state) => state.removePayoutAccount);
  const toast = useAppStore((state) => state.toast);

  const [period, setPeriod] = useState<Period>('week');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<PayoutAccount | null>(null);

  const today = toDateKey(new Date());

  const periodDays = useMemo(() => {
    if (period === 'today') return earnings.filter((day) => day.date === today);
    if (period === 'week') return earnings.slice(-7);
    return earnings.filter((day) => day.date.startsWith(today.slice(0, 7)));
  }, [earnings, period, today]);

  const chartDays = useMemo(
    () => (period === 'month' ? earnings.slice(-14) : earnings.slice(-7)),
    [earnings, period],
  );

  const totals = useMemo(() => {
    const takings = TAKINGS_METHODS.reduce<Record<TakingsMethod, number>>(
      (acc, method) => ({ ...acc, [method.id]: 0 }),
      { cash: 0, bkash: 0, nagad: 0, rocket: 0, card: 0 },
    );
    let tips = 0;
    let net = 0;
    let count = 0;
    for (const day of periodDays) {
      for (const method of TAKINGS_METHODS) takings[method.id] += day.takings[method.id] ?? 0;
      tips += day.tips;
      net += day.net;
      count += day.appointments;
    }
    const gross = Object.values(takings).reduce((sum, value) => sum + value, 0);
    // Derived rather than recomputed, so the four lines always add up to the
    // headline even where the daily rows rounded.
    const fee = Math.max(0, gross + tips - net);
    return { takings, tips, net, gross, fee, count };
  }, [periodDays]);

  const periodKeys = useMemo(() => new Set(periodDays.map((day) => day.date)), [periodDays]);

  const recent = useMemo(
    () =>
      appointments
        .filter((item) => item.stage === 'completed' && periodKeys.has(item.date))
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
        .slice(0, 8),
    [appointments, periodKeys],
  );

  // `useProviderStore` scopes payout accounts to the signed-in provider, so
  // everything here is already theirs.
  const defaultAccount = payoutAccounts.find((account) => account.isDefault) ?? payoutAccounts[0];

  const chartPeak = Math.max(...chartDays.map((day) => day.net), 1);
  const splitMax = Math.max(...TAKINGS_METHODS.map((method) => totals.takings[method.id]), 1);
  const usedMethods = TAKINGS_METHODS.filter((method) => totals.takings[method.id] > 0);

  const handleAdd = (account: Omit<PayoutAccount, 'id' | 'providerId'>) => {
    addPayoutAccount(account);
    setSheetOpen(false);
    toast('success', t('pb.payoutAdded'), account.holderName);
  };

  const handleRemove = () => {
    if (!pendingRemove) return;
    removePayoutAccount(pendingRemove.id);
    setPendingRemove(null);
    toast('info', t('pb.payoutRemoved'));
  };

  const accountLine = (account: PayoutAccount) =>
    account.bankName ? `${account.bankName} · ${account.number}` : account.number;

  return (
    <Screen nav>
      <Header
        title={t('nav.earnings')}
        actions={
          // A solo barber's fifth tab is Earnings, so this is their only way
          // through to business settings and signing out.
          <IconButton label={t('nav.profile')} onClick={() => navigate(ROUTES.proProfile)}>
            <UserRound size={20} />
          </IconButton>
        }
      />
      <ScreenBody className="pb-screen pb-ledger">
        <Segmented
          tabs={[
            { id: 'today', label: t('pro.today') },
            { id: 'week', label: t('pb.periodWeek') },
            { id: 'month', label: t('pb.periodMonth') },
          ]}
          active={period}
          onChange={setPeriod}
          label={t('pb.periodLabel')}
        />

        <Card className="pb-net-card">
          <div className="pb-net" aria-live="polite">
            <span className="label">{t('pb.netForPeriod')}</span>
            <strong className="pb-net-value">{formatBdt(totals.net)}</strong>
            <span className="caption">
              {t('pro.appointments', { count: formatNumber(totals.count) })}
            </span>
          </div>
          <dl className="kv pb-net-kv">
            <div className="kv-row">
              <dt>{t('pb.gross')}</dt>
              <dd>{formatBdt(totals.gross)}</dd>
            </div>
            <div className="kv-row">
              <dt>{t('pb.platformFee')}</dt>
              <dd>−{formatBdt(totals.fee)}</dd>
            </div>
            <div className="kv-row">
              <dt>{t('pro.tips')}</dt>
              <dd>{formatBdt(totals.tips)}</dd>
            </div>
            <div className="kv-row kv-total">
              <dt>{t('pro.net')}</dt>
              <dd>{formatBdt(totals.net)}</dd>
            </div>
          </dl>
          <p className="field-hint">
            {t('pb.feeHint', {
              percent: t('pb.percent', { value: formatNumber(PLATFORM_COMMISSION * 100) }),
            })}
          </p>
        </Card>

        <section className="section" aria-labelledby="pb-chart">
          <h3 className="label" id="pb-chart">{t('pb.chartTitle')}</h3>
          <Card>
            <div
              className="pro-chart"
              role="img"
              aria-label={t('pb.chartLabel', { count: formatNumber(chartDays.length) })}
            >
              {chartDays.map((day) => (
                <div
                  className="pro-chart-col"
                  key={day.date}
                  data-peak={day.net === chartPeak && day.net > 0 ? 'true' : undefined}
                >
                  <span
                    className="pro-chart-bar"
                    style={{ height: `${Math.max(3, (day.net / chartPeak) * 100)}%` }}
                  />
                  <small>{formatPattern(dateOf(day.date), 'EEEEE')}</small>
                </div>
              ))}
            </div>
            <ul className="pb-chart-legend">
              {chartDays.map((day) => (
                <li key={day.date} className="sr-only">
                  {t('pb.chartDay', {
                    day: formatDayLabel(day.date),
                    amount: formatBdt(day.net),
                  })}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="section" aria-labelledby="pb-split">
          <h3 className="label" id="pb-split">{t('pb.howTheyPaid')}</h3>
          {usedMethods.length === 0 ? (
            <div className="pro-empty-day">
              <strong>{t('pb.noTakingsTitle')}</strong>
              <span>{t('pb.noTakingsBody')}</span>
            </div>
          ) : (
            <Card>
              <ul className="pb-split">
                {usedMethods.map((method) => {
                  const amount = totals.takings[method.id];
                  return (
                    <li
                      className="pb-split-row"
                      key={method.id}
                      aria-label={t('pb.methodShare', {
                        label: t(takingsLabelKey(method.id)),
                        amount: formatBdt(amount),
                      })}
                    >
                      <span className="pb-split-head">
                        <MethodDot color={takingsColor(method.id)} />
                        <span className="pb-split-name">{t(takingsLabelKey(method.id))}</span>
                        <strong className="pb-split-amount">{formatBdt(amount)}</strong>
                      </span>
                      <span className="pb-split-track" aria-hidden="true">
                        <span
                          className="pb-split-fill"
                          style={{
                            width: `${(amount / splitMax) * 100}%`,
                            backgroundColor: takingsColor(method.id),
                          }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="field-hint">{t('pb.howTheyPaidHint')}</p>
            </Card>
          )}
        </section>

        <section className="section" aria-labelledby="pb-recent">
          <h3 className="label" id="pb-recent">{t('pb.recent')}</h3>
          {recent.length === 0 ? (
            <p className="caption dim">{t('pb.recentEmpty')}</p>
          ) : (
            <div className="stack-sm">
              {recent.map((item) => (
                <article className="pb-txn" key={item.id}>
                  <div className="grow">
                    <span className="pb-txn-name">{item.customerName}</span>
                    <span className="pb-txn-meta">
                      {item.services.map((service) => service.name).join(', ')}
                    </span>
                    <span className="pb-txn-meta dim">{formatDayLabel(item.date)}</span>
                  </div>
                  <div className="pb-txn-end">
                    <strong>{formatBdt(item.total + (item.tip ?? 0))}</strong>
                    <span className="pb-txn-method">
                      <MethodDot color={takingsColor(item.paidWith)} size={8} />
                      {t(takingsLabelKey(item.paidWith))}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="section" aria-labelledby="pb-payout">
          <h3 className="label" id="pb-payout">{t('pb.payout')}</h3>

          {!defaultAccount ? (
            <EmptyState
              icon={<Wallet size={26} aria-hidden="true" />}
              title={t('pb.payoutNoneTitle')}
              description={t('pb.payoutNoneBody')}
              action={
                <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setSheetOpen(true)}>
                  {t('pb.payoutAdd')}
                </Button>
              }
            />
          ) : (
            <div className="stack-sm">
              {!defaultAccount.verified ? (
                <Callout
                  tone="warning"
                  title={t('pb.payoutHeldTitle')}
                  icon={<AlertTriangle size={18} aria-hidden="true" />}
                >
                  {t('pb.payoutHeldBody')}
                </Callout>
              ) : null}

              {payoutAccounts.map((account) => (
                <Card key={account.id} className="pb-payout">
                  <div className="between">
                    <span className="row-sm">
                      <MethodDot color={payoutColor(account.method)} size={12} />
                      <strong>{t(payoutLabelKey(account.method))}</strong>
                    </span>
                    <Badge tone={account.verified ? 'success' : 'warning'}>
                      {t(account.verified ? 'pro.verified' : 'pro.verificationPending')}
                    </Badge>
                  </div>
                  <p className="pb-payout-number">{accountLine(account)}</p>
                  <p className="caption dim">{account.holderName}</p>
                  <div className="row-sm pb-payout-actions">
                    {account.id === defaultAccount.id ? (
                      <Badge tone="accent">{t('pb.payoutDefault')}</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDefaultPayoutAccount(account.id);
                          toast('success', t('pb.payoutDefaultSet'));
                        }}
                      >
                        {t('pb.payoutUse')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingRemove(account)}
                      aria-label={t('pb.payoutRemove', { name: account.holderName })}
                    >
                      {t('action.delete')}
                    </Button>
                  </div>
                </Card>
              ))}

              <Button
                variant="outline"
                block
                icon={
                  payoutAccounts.length ? (
                    <Pencil size={18} aria-hidden="true" />
                  ) : (
                    <Plus size={18} aria-hidden="true" />
                  )
                }
                onClick={() => setSheetOpen(true)}
              >
                {payoutAccounts.length ? t('pb.payoutChange') : t('pb.payoutAdd')}
              </Button>
            </div>
          )}
        </section>
      </ScreenBody>

      {sheetOpen ? <PayoutSheet onClose={() => setSheetOpen(false)} onSave={handleAdd} /> : null}

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        onConfirm={handleRemove}
        tone="danger"
        title={t('pb.payoutRemoveTitle')}
        description={t('pb.payoutRemoveBody')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
      />
    </Screen>
  );
}
