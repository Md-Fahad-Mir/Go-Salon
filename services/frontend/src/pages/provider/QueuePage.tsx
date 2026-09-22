import { CalendarX2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppointmentRow } from '../../components/provider/queue/AppointmentRow';
import { NowNextCard } from '../../components/provider/queue/NowNextCard';
import { PaymentSheet } from '../../components/provider/queue/PaymentSheet';
import { WalkInSheet, type WalkInDraft } from '../../components/provider/queue/WalkInSheet';
import {
  TAKINGS_KEYS,
  arrivalsOffView,
  isSettled,
  onDay,
  ownedBy,
  todayKey,
} from '../../components/provider/queue/queueUtils';
import { useTicker } from '../../components/provider/queue/useTicker';
import { ActionSheet } from '../../components/common/ActionSheet';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { useT } from '../../hooks/useLanguage';
import { useProviderProfile } from '../../hooks/useRole';
import type { TranslationKey } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { ProviderAppointment, TakingsMethod } from '../../types';
import { messageOf } from '../../utils/errorMessage';
import { firstNameOf, formatBdt, formatDateLong, formatDayLabel, formatNumber } from '../../utils/format';

/* Three roles share this screen — a barber with his own chair, an employee
   renting one in someone else's salon, and a women's stylist. */

const greetingKey = (hour: number): TranslationKey =>
  hour < 12 ? 'proQueue.greetMorning' : hour < 17 ? 'proQueue.greetAfternoon' : 'proQueue.greetEvening';

export default function QueuePage() {
  const t = useT();
  const profile = useProviderProfile();
  const user = useAppStore((s) => s.user);
  const toast = useAppStore((s) => s.toast);

  const appointments = useProviderStore((s) => s.appointments);
  const services = useProviderStore((s) => s.services);
  const staff = useProviderStore((s) => s.staff);
  const startAppointment = useProviderStore((s) => s.startAppointment);
  const completeAppointment = useProviderStore((s) => s.completeAppointment);
  const setStage = useProviderStore((s) => s.setStage);
  const addWalkIn = useProviderStore((s) => s.addWalkIn);
  const reassign = useProviderStore((s) => s.reassign);
  const liveArrivals = useProviderStore((s) => s.liveArrivals);
  const dismissArrivals = useProviderStore((s) => s.dismissArrivals);

  const now = useTicker();
  const today = todayKey();

  const [payFor, setPayFor] = useState<ProviderAppointment | null>(null);
  const [noShowFor, setNoShowFor] = useState<ProviderAppointment | null>(null);
  const [moveFor, setMoveFor] = useState<ProviderAppointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInKey, setWalkInKey] = useState(0);
  const [addingWalkIn, setAddingWalkIn] = useState(false);

  const mine = useMemo(() => onDay(ownedBy(appointments, profile), today), [appointments, profile, today]);
  const live = mine.find((a) => a.stage === 'in_chair');
  /* Bookings this business approves by hand and has not answered yet. Not
     limited to today: one for next week still needs answering now, and they
     sit above the day's work because nobody can act until they are. */
  const waiting = ownedBy(appointments, profile).filter((a) => a.stage === 'pending');
  const upcoming = mine.filter((a) => a.stage === 'upcoming');
  const done = mine.filter((a) => isSettled(a.stage));
  const hero = live ?? upcoming[0];
  const queued = live ? upcoming : upcoming.slice(1);

  /* Came in while this screen was open, for a day other than today. */
  const justBooked = useMemo(
    () => arrivalsOffView(ownedBy(appointments, profile), liveArrivals, today),
    [appointments, profile, liveArrivals, today],
  );

  const activeServices = services.filter((service) => service.active);
  const greeting = t(greetingKey(now.getHours()), { name: firstNameOf(user?.name ?? profile?.businessName ?? '') });

  const start = (appointment: ProviderAppointment) => {
    startAppointment(appointment.id);
    toast('success', t('proQueue.startedToast', { name: appointment.customerName }));
  };

  const settle = (method: TakingsMethod, tip: number) => {
    if (!payFor) return;
    completeAppointment(payFor.id, method, tip || undefined);
    toast(
      'success',
      t('proQueue.payDone', { name: payFor.customerName }),
      t('proQueue.payDoneBody', {
        amount: formatBdt(payFor.total + tip),
        method: t(TAKINGS_KEYS[method]),
      }),
    );
    setPayFor(null);
  };

  const confirmNoShow = () => {
    if (!noShowFor) return;
    setStage(noShowFor.id, 'no_show');
    toast('warning', t('proQueue.noShowDone', { name: noShowFor.customerName }));
    setNoShowFor(null);
  };

  const openMove = (appointment: ProviderAppointment) => {
    const others = staff.filter((member) => member.active && member.id !== appointment.staffId);
    if (!others.length) {
      toast('info', t('proQueue.reassignEmpty'));
      return;
    }
    setMoveFor(appointment);
  };

  const addWalkInClient = async (draft: WalkInDraft) => {
    setAddingWalkIn(true);
    try {
      const created = await addWalkIn(draft);
      if (!created) {
        toast('error', t('proQueue.walkInPickError'));
        return;
      }
      toast('success', t('proQueue.walkInDone', { name: created.customerName }));
      setWalkInOpen(false);
      setWalkInKey((key) => key + 1);
    } catch (failure) {
      // The sheet stays open: somebody is standing at the counter and
      // retyping their order is worse than reading the reason.
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setAddingWalkIn(false);
    }
  };

  return (
    <Screen nav>
      <Header
        title={greeting}
        align="start"
      />

      <ScreenBody className="pq-day">
        <p className="pq-date">{formatDateLong(now)}</p>

        {hero ? (
          <NowNextCard
            appointment={hero}
            live={Boolean(live)}
            now={now}
            onStart={() => start(hero)}
            onComplete={() => setPayFor(hero)}
            onNoShow={() => setNoShowFor(hero)}
            onReassign={() => openMove(hero)}
          />
        ) : (
          <div className="pro-empty-day">
            <CalendarX2 size={26} aria-hidden="true" />
            <strong>{t(mine.length ? 'proQueue.dayDoneTitle' : 'proQueue.dayEmptyTitle')}</strong>
            <p>{t(mine.length ? 'proQueue.dayDoneBody' : 'proQueue.dayEmptyBody')}</p>
          </div>
        )}

        {justBooked.length ? (
          <section className="section" aria-label={t('proQueue.justBookedTitle')}>
            <div className="pro-section-head">
              <h3>{t('proQueue.justBookedTitle')}</h3>
              <Button variant="ghost" size="sm" onClick={dismissArrivals}>
                {t('proQueue.justBookedClear')}
              </Button>
            </div>
            <p className="caption">{t('proQueue.justBookedHint')}</p>
            <div className="stack-sm">
              {justBooked.map((appointment) => (
                <div key={appointment.id}>
                  <span className="label">{formatDayLabel(appointment.date)}</span>
                  <AppointmentRow appointment={appointment} now={now} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {waiting.length ? (
          <section className="section" aria-label={t('proQueue.waitingTitle')}>
            <div className="pro-section-head">
              <h3>{t('proQueue.waitingTitle')}</h3>
              <span>{t('pro.appointments', { count: formatNumber(waiting.length) })}</span>
            </div>
            <div className="stack-sm">
              {waiting.map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} now={now} />
              ))}
            </div>
          </section>
        ) : null}

        {queued.length || done.length ? (
          <section className="section" aria-label={t('proQueue.restOfDay')}>
            {queued.length ? (
              <>
                <div className="pro-section-head">
                  <h3>{t('pro.stageUpcoming')}</h3>
                  <span>{t('pro.appointments', { count: formatNumber(queued.length) })}</span>
                </div>
                <div className="stack-sm">
                  {queued.map((appointment) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} now={now} />
                  ))}
                </div>
              </>
            ) : null}

            {done.length ? (
              <>
                <div className="pro-section-head">
                  <h3>{t('proQueue.doneToday')}</h3>
                  <span>{t('pro.appointments', { count: formatNumber(done.length) })}</span>
                </div>
                <div className="stack-sm">
                  {done.map((appointment) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} now={now} readOnly />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </ScreenBody>

      <StickyFooter>
        <Button
          block
          size="lg"
          variant="secondary"
          icon={<UserPlus size={20} aria-hidden="true" />}
          onClick={() => setWalkInOpen(true)}
        >
          {t('pro.addWalkIn')}
        </Button>
      </StickyFooter>

      <WalkInSheet
        key={walkInKey}
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        services={activeServices}
        saving={addingWalkIn}
        onAdd={(draft) => void addWalkInClient(draft)}
      />

      <PaymentSheet
        key={payFor?.id ?? 'pay'}
        appointment={payFor}
        onClose={() => setPayFor(null)}
        onConfirm={settle}
      />

      <ConfirmDialog
        open={Boolean(noShowFor)}
        onClose={() => setNoShowFor(null)}
        onConfirm={confirmNoShow}
        tone="danger"
        title={t('proQueue.noShowTitle', { name: noShowFor?.customerName ?? '' })}
        description={t('proQueue.noShowBody')}
        confirmLabel={t('pro.markNoShow')}
        cancelLabel={t('action.cancel')}
      />

      <ActionSheet
        open={Boolean(moveFor)}
        onClose={() => setMoveFor(null)}
        title={t('proQueue.reassignTitle')}
        actions={staff
          .filter((member) => member.active && member.id !== moveFor?.staffId)
          .map((member) => ({
            label: member.name,
            onSelect: () => {
              if (!moveFor) return;
              reassign(moveFor.id, member.id);
              toast('success', t('proQueue.reassignDone', { name: member.name }));
            },
          }))}
      />
    </Screen>
  );
}
