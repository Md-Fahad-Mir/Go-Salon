import { AlertTriangle, CalendarOff, Pencil, Phone, Trash2, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { Button, LinkButton } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { Rating } from '../../components/common/Rating';
import { Spinner } from '../../components/common/Spinner';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ExternalButton } from '../../components/profile/ExternalButton';
import { SalonApptRow } from '../../components/provider/salon/SalonApptRow';
import {
  EmploymentSheet,
  PersonSheet,
  StaffServicesSheet,
} from '../../components/provider/salon/StaffEditSheets';
import { WeekHoursList } from '../../components/provider/hours/WeekHoursList';
import { WeekHoursSheet } from '../../components/provider/hours/WeekHoursSheet';
import {
  byTime,
  commissionOf,
  settledOn,
  takeOf,
} from '../../components/provider/salon/salonLabels';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { Schedule, WeekSchedule } from '../../types';
import { messageOf } from '../../utils/errorMessage';
import { scheduleService } from '../../utils/scheduleService';
import type { StaffPatch } from '../../utils/staffService';
import {
  formatBdt,
  formatDateLong,
  formatNumber,
  formatPhone,
  toDateKey,
} from '../../utils/format';


export default function StaffMemberPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  /* This chair's score, from `by_staff` on `/api/reviews/` — which the server
     returns for an owner only, and computes over the reviews of work done in
     this chair rather than of the salon as a whole. */
  const { byStaff } = useMyReviews();
  const score = byStaff.find((row) => row.employeeId === id);
  const navigate = useNavigate();
  const staff = useProviderStore((s) => s.staff);
  const services = useProviderStore((s) => s.services);
  const appointments = useProviderStore((s) => s.appointments);
  const updateStaff = useProviderStore((s) => s.updateStaff);
  const removeStaff = useProviderStore((s) => s.removeStaff);
  const updateService = useProviderStore((s) => s.updateService);
  const toast = useAppStore((s) => s.toast);

  const [sheet, setSheet] = useState<'employment' | 'person' | 'schedule' | 'services' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /* This chair's hours are its own resource — the roster does not carry them,
     so the page fetches the one it is looking at. */
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    scheduleService
      .forEmployee(id)
      .then((result) => {
        if (live) setSchedule(result);
      })
      .catch(() => {
        if (live) setSchedule(null);
      });
    return () => {
      live = false;
    };
  }, [id]);

  const member = staff.find((entry) => entry.id === id) ?? null;
  const todayKey = toDateKey(new Date());
  const monthKey = todayKey.slice(0, 7);

  const today = useMemo(
    () =>
      member
        ? appointments.filter((a) => a.staffId === member.id && a.date === todayKey).sort(byTime)
        : [],
    [appointments, member, todayKey],
  );

  /* The month's work, counted the way the salon's reports count it: revenue is
     the services at the salon's prices, and a booking falls in the month it was
     closed off rather than the month it was booked for. */
  const month = useMemo(() => {
    if (!member) return { count: 0, revenue: 0, commission: 0 };
    const done = appointments.filter(
      (a) => a.staffId === member.id && a.stage === 'completed' && settledOn(a).startsWith(monthKey),
    );
    const revenue = done.reduce((sum, a) => sum + takeOf(a), 0);
    return { count: done.length, revenue, commission: commissionOf(revenue, member) };
  }, [appointments, member, monthKey]);

  if (!member) {
    return (
      <Screen>
        <Header title={t('salon.memberTitle')} back backTo={ROUTES.proSalonStaff} />
        <ScreenBody className="fullscreen-center">
          <EmptyState
            icon={<UserX size={26} aria-hidden="true" />}
            title={t('salon.memberMissingTitle')}
            description={t('salon.memberMissingBody')}
            action={<LinkButton to={ROUTES.proSalonStaff}>{t('salon.backToRoster')}</LinkButton>}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const chair = member;

  const save = async (patch: StaffPatch, message = t('salon.savedToast')) => {
    setSaving(true);
    try {
      await updateStaff(chair.id, patch);
      toast('success', message);
      setSheet(null);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  /* Which services this chair is *named* on. A service that names nobody is
     open to everyone, so this list being short does not mean they are idle. */
  const canDo = services.filter((service) => service.staffIds.includes(chair.id));

  /** Eligibility lives on the service, so clearing someone for one means
      editing that service's own list — there is nowhere else to write it. */
  const saveServices = async (serviceIds: string[]) => {
    setSaving(true);
    try {
      for (const service of services) {
        const cleared = serviceIds.includes(service.id);
        if (cleared === service.staffIds.includes(chair.id)) continue;
        await updateService(service.id, {
          eligible_employee_ids: (cleared
            ? [...service.staffIds, chair.id]
            : service.staffIds.filter((entry) => entry !== chair.id)
          ).map(Number),
        });
      }
      toast('success', t('salon.savedToast'));
      setSheet(null);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  const saveHours = async (days: WeekSchedule) => {
    setSaving(true);
    try {
      setSchedule(await scheduleService.saveForEmployee(chair.id, days));
      toast('success', t('hours.saved'));
      setSheet(null);
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  const handBackHours = async () => {
    try {
      setSchedule(await scheduleService.clearForEmployee(chair.id));
      toast('success', t('hours.handBackDone'));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    }
  };

  return (
    <Screen>
      <Header title={t('salon.memberTitle')} back backTo={ROUTES.proSalonStaff} />
      <ScreenBody>
        <div className="card card-pad stack-sm ps-member-head">
          <div className="row">
            <Avatar name={member.name} src={member.avatar || undefined} size="xl" />
            <div className="stack-xs" style={{ minWidth: 0 }}>
              <h2 className="ps-staff-name">{member.name}</h2>
              <p className="ps-staff-title">{member.title}</p>
              {score ? <Rating value={score.rating} count={score.reviewCount} /> : null}
              {member.phoneVerified ? null : (
                <span className="pro-pill pro-pill-warning">{t('salon.awaitingFirstSignIn')}</span>
              )}
            </div>
          </div>
          {member.active ? null : (
            <p className="ps-inactive-note">
              <AlertTriangle size={14} aria-hidden="true" />
              {t('salon.inactiveNote')}
            </p>
          )}
        </div>

        <section className="section">
          <ExternalButton
            href={`tel:${member.phone}`}
            newTab={false}
            variant="outline"
            block
            icon={<Phone size={18} aria-hidden="true" />}
          >
            {member.phone ? formatPhone(member.phone) : t('action.call')}
          </ExternalButton>
          <div className="card card-pad-sm">
            <Toggle
              checked={member.active}
              onChange={(active) => void save({ is_active: active })}
              label={t('salon.takingBookings')}
            />
          </div>
        </section>

        <section className="section" aria-labelledby="sm-today">
          <div className="ps-edit-head">
            <h3 className="label" id="sm-today">{t('salon.todaysAppointments')}</h3>
            <span className="caption">{t('salon.bookingsCount', { count: formatNumber(today.length) })}</span>
          </div>
          {today.length ? (
            <div className="stack-sm">
              {today.map((appointment) => (
                <SalonApptRow key={appointment.id} appointment={appointment} showStylist={false} />
              ))}
            </div>
          ) : (
            <div className="pro-empty-day">
              <CalendarOff size={22} aria-hidden="true" />
              <strong>{t('salon.noneTodayTitle')}</strong>
              <p className="caption">{t('salon.noneTodayBody')}</p>
            </div>
          )}
        </section>

        <section className="section" aria-labelledby="sm-employment">
          <div className="ps-edit-head">
            <h3 className="label" id="sm-employment">{t('salon.employment')}</h3>
            <button type="button" onClick={() => setSheet('employment')}>
              {t('action.edit')} <Pencil size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="card card-pad">
            <dl className="kv">
              <div className="kv-row">
                <dt>{t('salon.fieldTitle')}</dt>
                <dd>{member.title || t('salon.noTitle')}</dd>
              </div>
              <div className="kv-row">
                <dt>{t('pro.commission')}</dt>
                <dd>{t('salon.percentValue', { value: formatNumber(member.commissionRate) })}</dd>
              </div>
              <div className="kv-row">
                <dt>{t('salon.joined')}</dt>
                <dd>{formatDateLong(member.joinedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* The card a customer reads. It is the person's own and they edit it
            from their profile — but an owner-created account starts empty, and
            an empty chair on the public roster helps nobody, so the owner can
            fill it in too. */}
        <section className="section" aria-labelledby="sm-person">
          <div className="ps-edit-head">
            <h3 className="label" id="sm-person">{t('salon.personSection')}</h3>
            <button type="button" onClick={() => setSheet('person')}>
              {t('action.edit')} <Pencil size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="card card-pad stack-sm">
            <p className="caption">{member.bio || t('salon.noStaffBio')}</p>
            <dl className="kv">
              <div className="kv-row">
                <dt>{t('salon.experience')}</dt>
                <dd>{t('salon.experienceYears', { count: formatNumber(member.experienceYears) })}</dd>
              </div>
            </dl>
            <div className="stack-xs">
              <span className="label">{t('salon.specialties')}</span>
              {member.specialties.length ? (
                <div className="row-sm" style={{ flexWrap: 'wrap' }}>
                  {member.specialties.map((specialty) => (
                    <Badge key={specialty} tone="neutral">{specialty}</Badge>
                  ))}
                </div>
              ) : (
                <p className="caption">{t('salon.noSpecialties')}</p>
              )}
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="sm-schedule">
          <div className="ps-edit-head">
            <h3 className="label" id="sm-schedule">{t('salon.schedule')}</h3>
            <button type="button" onClick={() => setSheet('schedule')}>
              {t('action.edit')} <Pencil size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="card card-pad stack-sm">
            <p className="caption">
              {schedule?.source === 'own'
                ? t('salon.staffHoursOwn')
                : t('salon.staffHoursInherited')}
            </p>
            {schedule ? <WeekHoursList week={schedule.days} /> : <Spinner label={t('state.loading')} />}
            {schedule?.source === 'own' ? (
              <Button variant="ghost" size="sm" onClick={() => void handBackHours()}>
                {t('salon.staffHoursBack')}
              </Button>
            ) : null}
          </div>
        </section>

        <section className="section" aria-labelledby="sm-services">
          <div className="ps-edit-head">
            <h3 className="label" id="sm-services">{t('salon.canPerform')}</h3>
            <button type="button" onClick={() => setSheet('services')}>
              {t('action.edit')} <Pencil size={14} aria-hidden="true" />
            </button>
          </div>
          {canDo.length ? (
            <div className="card card-pad">
              <div className="row-sm" style={{ flexWrap: 'wrap' }}>
                {canDo.map((service) => (
                  <Badge key={service.id} tone="accent">{service.name}</Badge>
                ))}
              </div>
            </div>
          ) : (
            <Callout tone="warning">{t('salon.noServicesForStaff')}</Callout>
          )}
        </section>

        <section className="section" aria-labelledby="sm-performance">
          <h3 className="label ps-chapter" id="sm-performance">{t('salon.monthPerformance')}</h3>
          {month.count ? (
            <div className="pro-stats">
              <div className="pro-stat">
                <strong>{formatNumber(month.count)}</strong>
                <span>{t('salon.perfCompleted')}</span>
              </div>
              <div className="pro-stat">
                <strong>{formatBdt(month.revenue)}</strong>
                <span>{t('salon.perfRevenue')}</span>
              </div>
              <div className="pro-stat pro-stat-accent">
                <strong>{formatBdt(month.commission)}</strong>
                <span>{t('salon.perfCommission')}</span>
              </div>
            </div>
          ) : (
            <p className="muted">{t('salon.perfEmpty')}</p>
          )}
          {/* What these three numbers are and are not. The commission is
              computed at the rate on the employment today — nothing records
              what it was on the day — so the caption says so instead of letting
              it read as history. */}
          {month.count ? (
            <>
              <p className="caption">{t('salon.perfBasis')}</p>
              <p className="caption">
                {t('salon.perfRateNote', { rate: formatNumber(chair.commissionRate) })}
              </p>
            </>
          ) : null}
        </section>

        <Button
          variant="danger-soft"
          block
          icon={<Trash2 size={18} aria-hidden="true" />}
          onClick={() => setConfirmOpen(true)}
        >
          {t('salon.removeStaff')}
        </Button>
      </ScreenBody>

      <PersonSheet
        key={`person-${sheet === 'person'}`}
        open={sheet === 'person'}
        onClose={() => setSheet(null)}
        member={member}
        saving={saving}
        onSave={(patch) => void save(patch)}
      />
      <EmploymentSheet
        key={`employment-${sheet === 'employment'}`}
        open={sheet === 'employment'}
        onClose={() => setSheet(null)}
        member={member}
        saving={saving}
        onSave={(patch) => void save(patch)}
      />
      {sheet === 'schedule' && schedule ? (
        <WeekHoursSheet
          open
          week={schedule.days}
          saving={saving}
          title={t('salon.staffHoursTitle')}
          onClose={() => setSheet(null)}
          onSave={saveHours}
          onCopyAll={() => toast('info', t('hours.copiedToast'))}
        />
      ) : null}
      <StaffServicesSheet
        key={`services-${sheet === 'services'}`}
        open={sheet === 'services'}
        onClose={() => setSheet(null)}
        member={member}
        services={services}
        saving={saving}
        onSave={(serviceIds) => void saveServices(serviceIds)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          void removeStaff(member.id)
            .then(() => {
              toast('success', t('salon.removedToast', { name: member.name }));
              navigate(ROUTES.proSalonStaff, { replace: true });
            })
            .catch((failure: unknown) =>
              toast('error', t('state.saveFailed'), messageOf(failure)),
            );
        }}
        title={t('salon.removeStaffTitle', { name: member.name })}
        description={t('salon.removeStaffBody')}
        confirmLabel={t('salon.removeStaff')}
        cancelLabel={t('action.cancel')}
        tone="danger"
        icon={<Trash2 size={22} aria-hidden="true" />}
      />
    </Screen>
  );
}
