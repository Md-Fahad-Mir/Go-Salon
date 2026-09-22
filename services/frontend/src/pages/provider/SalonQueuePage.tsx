import { addDays } from 'date-fns';
import { ArrowRightLeft, CalendarOff, CheckCircle2, PlayCircle, Store, UserPlus, UserX, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Chip } from '../../components/common/Chip';
import { EmptyState } from '../../components/common/EmptyState';
import { ActionSheet, type SheetAction } from '../../components/common/ActionSheet';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { WalkInSheet, type WalkInDraft } from '../../components/provider/queue/WalkInSheet';
import { ChairStrip } from '../../components/provider/salon/ChairStrip';
import { DayStrip } from '../../components/provider/salon/DayStrip';
import { PaymentSheet } from '../../components/provider/salon/PaymentSheet';
import { ReassignSheet } from '../../components/provider/salon/ReassignSheet';
import { SalonApptRow } from '../../components/provider/salon/SalonApptRow';
import { byTime, isSettled } from '../../components/provider/salon/salonLabels';
import { arrivalsOffView } from '../../components/provider/queue/queueUtils';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { ProviderAppointment } from '../../types';
import { messageOf } from '../../utils/errorMessage';
import { firstNameOf, formatDayLabel, formatNumber, toDateKey } from '../../utils/format';

/** Days either side of today the owner can step through without opening a
    calendar: yesterday's takings, tomorrow's bridal booking. */
const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

export default function SalonQueuePage() {
  const t = useT();
  const navigate = useNavigate();
  const profile = useProviderStore((s) => s.profile);
  const appointments = useProviderStore((s) => s.appointments);
  const staff = useProviderStore((s) => s.staff);
  const reassign = useProviderStore((s) => s.reassign);
  const addWalkIn = useProviderStore((s) => s.addWalkIn);
  const services = useProviderStore((s) => s.services);
  const startAppointment = useProviderStore((s) => s.startAppointment);
  const completeAppointment = useProviderStore((s) => s.completeAppointment);
  const setStage = useProviderStore((s) => s.setStage);
  const liveArrivals = useProviderStore((s) => s.liveArrivals);
  const dismissArrivals = useProviderStore((s) => s.dismissArrivals);
  const toast = useAppStore((s) => s.toast);

  const [offset, setOffset] = useState(0);
  const [chairId, setChairId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInKey, setWalkInKey] = useState(0);
  const [addingWalkIn, setAddingWalkIn] = useState(false);

  const todayKey = toDateKey(new Date());
  const dayKey = toDateKey(addDays(new Date(), offset));
  const activeStaff = useMemo(() => staff.filter((member) => member.active), [staff]);

  const today = useMemo(
    () => appointments.filter((a) => a.date === todayKey),
    [appointments, todayKey],
  );

  const day = useMemo(() => {
    const rows = appointments
      .filter((a) => a.date === dayKey && (!chairId || a.staffId === chairId))
      .sort(byTime);
    return {
      all: rows,
      upcoming: rows.filter((a) => a.stage === 'upcoming'),
      inChair: rows.filter((a) => a.stage === 'in_chair'),
      done: rows.filter((a) => isSettled(a.stage)),
    };
  }, [appointments, dayKey, chairId]);

  /* Bookings waiting on the salon are not a fact about the day they fall on:
     one for next Tuesday still needs answering today, so this list ignores
     the day strip entirely. */
  const waiting = useMemo(
    () => appointments.filter((a) => a.stage === 'pending').sort(byTime),
    [appointments],
  );

  /* Bookings that came in while this screen was open and fall on another day.
     Without this they would be announced by a toast and then be nowhere. */
  const justBooked = useMemo(
    () => arrivalsOffView(appointments, liveArrivals, dayKey),
    [appointments, liveArrivals, dayKey],
  );

  /* The owner can add a walk-in too, and theirs is the only one that gets to
     choose a chair — an employee only ever adds to their own. */
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
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setAddingWalkIn(false);
    }
  };

  const find = (id: string | null): ProviderAppointment | null =>
    id ? (appointments.find((a) => a.id === id) ?? null) : null;

  const menuFor = find(menuId);
  const filtered = chairId ? (staff.find((member) => member.id === chairId) ?? null) : null;

  const actionsFor = (appointment: ProviderAppointment): SheetAction[] => {
    const actions: SheetAction[] = [];
    if (appointment.stage === 'upcoming') {
      actions.push({
        label: t('pro.start'),
        icon: <PlayCircle size={20} aria-hidden="true" />,
        onSelect: () => {
          startAppointment(appointment.id);
          toast('success', t('salon.startedToast', { name: appointment.customerName }));
        },
      });
    }
    if (!isSettled(appointment.stage)) {
      actions.push(
        {
          label: t('salon.reassign'),
          icon: <ArrowRightLeft size={20} aria-hidden="true" />,
          onSelect: () => setReassignId(appointment.id),
        },
        {
          label: t('pro.complete'),
          icon: <CheckCircle2 size={20} aria-hidden="true" />,
          onSelect: () => setPayId(appointment.id),
        },
        {
          label: t('pro.markNoShow'),
          icon: <UserX size={20} aria-hidden="true" />,
          danger: true,
          onSelect: () => {
            setStage(appointment.id, 'no_show');
            toast('warning', t('salon.noShowToast', { name: appointment.customerName }));
          },
        },
      );
    } else {
      actions.push({
        label: t('salon.reassign'),
        icon: <ArrowRightLeft size={20} aria-hidden="true" />,
        onSelect: () => setReassignId(appointment.id),
      });
    }
    return actions;
  };

  if (!profile) {
    return (
      <Screen nav>
        <Header title={t('salon.queueTitle')} />
        <ScreenBody className="fullscreen-center">
          <EmptyState
            icon={<Store size={26} aria-hidden="true" />}
            title={t('salon.emptyDayTitle')}
            description={t('salon.emptyDayBody')}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const group = (titleKey: Parameters<typeof t>[0], rows: ProviderAppointment[], live?: boolean) =>
    rows.length ? (
      <section className="section" aria-live={live ? 'polite' : undefined}>
        <div className="pro-section-head">
          <h3>{t(titleKey)}</h3>
          <span>{t('salon.bookingsCount', { count: formatNumber(rows.length) })}</span>
        </div>
        <div className="stack-sm">
          {rows.map((appointment) => (
            <SalonApptRow key={appointment.id} appointment={appointment} onMenu={setMenuId} />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <Screen nav>
      <Header title={t('salon.queueTitle')} />
      <ScreenBody>
        <section className="section" aria-labelledby="sq-chairs">
          <div className="pro-section-head">
            <h3 id="sq-chairs">{t('salon.chairStrip')}</h3>
            <span>{t('salon.chairFilterHint')}</span>
          </div>
          {activeStaff.length ? (
            <ChairStrip
              staff={activeStaff}
              appointments={today}
              selectedId={chairId}
              onSelect={setChairId}
            />
          ) : (
            <p className="muted">{t('salon.emptyStaffBody')}</p>
          )}
        </section>

        <section className="section" aria-labelledby="sq-feed">
          <div className="pro-section-head">
            <h3 id="sq-feed">{t('salon.feedTitle')}</h3>
            <span>{t('salon.bookingsCount', { count: formatNumber(day.all.length) })}</span>
          </div>

          <DayStrip offsets={OFFSETS} value={offset} onChange={setOffset} />

          {filtered ? (
            <Chip
              small
              active
              icon={<X size={14} aria-hidden="true" />}
              onClick={() => setChairId(null)}
            >
              {t('salon.showingOnly', { name: firstNameOf(filtered.name) })}
            </Chip>
          ) : null}

          {justBooked.length ? (
            <div className="stack-sm">
              <div className="pro-section-head">
                <h3>{t('proQueue.justBookedTitle')}</h3>
                <Button variant="ghost" size="sm" onClick={dismissArrivals}>
                  {t('proQueue.justBookedClear')}
                </Button>
              </div>
              <p className="caption">{t('proQueue.justBookedHint')}</p>
              {justBooked.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  className="ps-appt-open"
                  onClick={() => navigate(ROUTES.proAppointment(appointment.id))}
                  aria-label={t('salon.openMember', { name: appointment.customerName })}
                >
                  <span className="label">{formatDayLabel(appointment.date)}</span>
                  <SalonApptRow appointment={appointment} />
                </button>
              ))}
            </div>
          ) : null}

          {waiting.length ? (
            <div className="stack-sm">
              <div className="pro-section-head">
                <h3>{t('proQueue.waitingTitle')}</h3>
                <span>{t('pro.appointments', { count: formatNumber(waiting.length) })}</span>
              </div>
              {waiting.map((appointment) => (
                /* A row that needs answering is a way in, not a readout: the
                   approve and turn-down buttons live on the appointment. */
                <button
                  key={appointment.id}
                  type="button"
                  className="ps-appt-open"
                  onClick={() => navigate(ROUTES.proAppointment(appointment.id))}
                  aria-label={t('salon.openMember', { name: appointment.customerName })}
                >
                  <SalonApptRow appointment={appointment} />
                </button>
              ))}
            </div>
          ) : null}

          {day.all.length ? (
            <>
              {group('salon.groupUpcoming', day.upcoming)}
              {group('salon.groupInChair', day.inChair, true)}
              {group('salon.groupDone', day.done)}
            </>
          ) : (
            <div className="pro-empty-day">
              <CalendarOff size={22} aria-hidden="true" />
              <strong>{filtered ? t('salon.emptyChairTitle', { name: firstNameOf(filtered.name) }) : t('salon.emptyDayTitle')}</strong>
              <p className="caption">{filtered ? t('salon.emptyChairBody') : t('salon.emptyDayBody')}</p>
              {filtered ? (
                <Button variant="outline" size="sm" onClick={() => setChairId(null)}>
                  {t('salon.clearFilter')}
                </Button>
              ) : null}
            </div>
          )}
        </section>
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
        services={services.filter((service) => service.active)}
        chairs={activeStaff}
        saving={addingWalkIn}
        onAdd={(draft) => void addWalkInClient(draft)}
      />

      <ActionSheet
        open={Boolean(menuFor)}
        onClose={() => setMenuId(null)}
        title={menuFor?.customerName}
        actions={menuFor ? actionsFor(menuFor) : []}
      />

      <ReassignSheet
        open={Boolean(reassignId)}
        onClose={() => setReassignId(null)}
        appointment={find(reassignId)}
        staff={activeStaff}
        onPick={(staffId) => {
          if (!reassignId) return;
          reassign(reassignId, staffId);
          const member = staff.find((entry) => entry.id === staffId);
          if (member) toast('success', t('salon.reassignedToast', { name: member.name }));
        }}
      />

      <PaymentSheet
        key={payId ?? 'none'}
        open={Boolean(payId)}
        onClose={() => setPayId(null)}
        appointment={find(payId)}
        onConfirm={(paidWith, tip) => {
          const appointment = find(payId);
          if (!appointment) return;
          completeAppointment(appointment.id, paidWith, tip);
          toast('success', t('salon.completedToast', { name: appointment.customerName }));
        }}
      />
    </Screen>
  );
}
