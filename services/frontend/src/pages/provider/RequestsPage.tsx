import { Inbox } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/common/EmptyState';
import { Spinner } from '../../components/common/Spinner';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { AppointmentRow } from '../../components/provider/queue/AppointmentRow';
import { ownedBy } from '../../components/provider/queue/queueUtils';
import { useTicker } from '../../components/provider/queue/useTicker';
import { SalonApptRow } from '../../components/provider/salon/SalonApptRow';
import { byTime } from '../../components/provider/salon/salonLabels';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useProviderProfile, useRole } from '../../hooks/useRole';
import { useProviderStore } from '../../store/useProviderStore';
import { formatDayLabel, formatNumber } from '../../utils/format';

/** Bookings waiting for an answer.
 *
 *  Deliberately not filtered to a day. A booking for next Tuesday still needs
 *  answering *today* — nobody can act on it until somebody says yes or no —
 *  which is why it is the one list in the app that ignores the calendar.
 *
 *  The answering itself lives on the appointment, where the customer, the
 *  service and the price are all in view; a row here is a way in, not a
 *  decision point. Approving from a list is how the wrong person gets a
 *  booking they never read.
 */
export default function RequestsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { isOwner } = useRole();
  const profile = useProviderProfile();
  const now = useTicker();

  const appointments = useProviderStore((s) => s.appointments);
  const status = useProviderStore((s) => s.status);
  const loadAppointments = useProviderStore((s) => s.loadAppointments);

  /* The socket keeps this live while the screen is open; this is for the way
     in — a reload, or a tab opened straight onto this route. */
  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const waiting = useMemo(
    () => ownedBy(appointments, profile).filter((a) => a.stage === 'pending').sort(byTime),
    [appointments, profile],
  );

  const loading = status === 'loading' && !appointments.length;

  return (
    <Screen nav>
      <Header title={t('nav.requests')} />
      <ScreenBody className="pq-requests">
        {loading ? (
          <div className="bk-loading" aria-busy="true">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        ) : waiting.length ? (
          <section className="section" aria-label={t('proQueue.waitingTitle')}>
            <div className="pro-section-head">
              <h3>{t('proQueue.waitingTitle')}</h3>
              <span>{t('pro.appointments', { count: formatNumber(waiting.length) })}</span>
            </div>
            <div className="stack-sm">
              {waiting.map((appointment) =>
                /* The owner's list names the chair, because "is this person in
                   the right seat" is part of the answer for them and not for
                   somebody looking at their own diary. */
                isOwner ? (
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
                ) : (
                  <div key={appointment.id}>
                    <span className="label">{formatDayLabel(appointment.date)}</span>
                    <AppointmentRow appointment={appointment} now={now} />
                  </div>
                ),
              )}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={<Inbox size={26} aria-hidden="true" />}
            title={t('pr.noneTitle')}
            description={t('pr.noneBody')}
          />
        )}
      </ScreenBody>
    </Screen>
  );
}
