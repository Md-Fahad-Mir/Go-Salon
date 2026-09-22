import { AlertTriangle, ChevronRight, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { Avatar } from '../../components/common/Avatar';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Rating } from '../../components/common/Rating';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import {
  StaffFormSheet,
  type NewStaffDraft,
} from '../../components/provider/salon/StaffFormSheet';
import { Spinner } from '../../components/common/Spinner';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import { fieldMessageOf, messageOf } from '../../utils/errorMessage';
import { formatNumber } from '../../utils/format';

export default function StaffRosterPage() {
  const t = useT();
  const navigate = useNavigate();
  /* A score under each stylist's name. `by_staff` comes back only for an
     owner — a stylist reading this endpoint gets their own reviews and no
     comparison with the chair beside them. */
  const { byStaff } = useMyReviews();
  const staff = useProviderStore((s) => s.staff);
  const services = useProviderStore((s) => s.services);
  const addStaff = useProviderStore((s) => s.addStaff);
  const updateStaff = useProviderStore((s) => s.updateStaff);
  const updateService = useProviderStore((s) => s.updateService);
  const status = useProviderStore((s) => s.status);
  const error = useProviderStore((s) => s.error);
  const load = useProviderStore((s) => s.load);
  const toast = useAppStore((s) => s.toast);
  const scores = useMemo(
    () => new Map(byStaff.map((row) => [row.employeeId, row])),
    [byStaff],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const addChair = async (draft: NewStaffDraft) => {
    setSaving(true);
    setPhoneError(undefined);
    try {
      const member = await addStaff({
        phone: draft.phone,
        name: draft.name,
        title: draft.title,
        commission_rate: draft.commissionRate,
        password: draft.password,
      });

      /* Eligibility lives on the service, so naming the new chair means
         editing the services it was ticked for — one source of truth, and
         nothing to keep in step afterwards. */
      for (const service of services) {
        if (!draft.serviceIds.includes(service.id)) continue;
        await updateService(service.id, {
          eligible_employee_ids: [...service.staffIds, member.id].map(Number),
        });
      }

      // A number that already belonged to a barber joins with the account it
      // had — worth saying, because no new password was handed over.
      const joinedExisting = member.phoneVerified;
      toast(
        'success',
        joinedExisting
          ? t('salon.staffAddedExisting', { name: member.name })
          : t('salon.staffAddedToast', { name: member.name }),
      );
      setSheetOpen(false);
      setSheetKey((value) => value + 1);
    } catch (failure) {
      setPhoneError(fieldMessageOf(failure, 'phone'));
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (id: string, active: boolean) => {
    try {
      await updateStaff(id, { is_active: active });
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    }
  };

  /* Two buckets that add up to the whole roster. A chair either takes bookings
     or it does not; there is no third thing to be. */
  const summary = useMemo(
    () => ({
      active: staff.filter((member) => member.active).length,
      paused: staff.filter((member) => !member.active).length,
    }),
    [staff],
  );

  return (
    <Screen nav>
      <Header title={t('nav.staff')} />
      <ScreenBody>
        {status === 'loading' && staff.length === 0 ? (
          <div className="fullscreen-center">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        ) : status === 'error' ? (
          <EmptyState
            icon={<Users size={26} aria-hidden="true" />}
            title={t('state.loadFailedTitle')}
            description={error ?? undefined}
            action={<Button onClick={() => void load()}>{t('state.retry')}</Button>}
          />
        ) : staff.length ? (
          <>
            <div className="pro-stats" data-count="2" aria-live="polite">
              <div className="pro-stat pro-stat-accent">
                <strong>{formatNumber(summary.active)}</strong>
                <span>{t('salon.summaryActive')}</span>
              </div>
              <div className="pro-stat">
                <strong>{formatNumber(summary.paused)}</strong>
                <span>{t('salon.summaryPaused')}</span>
              </div>
            </div>

            <section className="section" aria-labelledby="sr-list">
              <div className="pro-section-head">
                <h3 id="sr-list">{t('salon.staffTitle')}</h3>
                <span>{t('salon.staffCount', { count: formatNumber(staff.length) })}</span>
              </div>

              <div className="ps-staff stagger">
                {staff.map((member) => (
                  <div key={member.id} className="ps-staff-card" data-inactive={member.active ? undefined : 'true'}>
                    <button
                      type="button"
                      className="ps-staff-open"
                      aria-label={t('salon.openMember', { name: member.name })}
                      onClick={() => navigate(ROUTES.proSalonStaffMember(member.id))}
                    >
                      <Avatar name={member.name} src={member.avatar || undefined} size="lg" />
                      <span className="ps-staff-body">
                        <span className="ps-staff-name">{member.name}</span>
                        <span className="ps-staff-title">{member.title}</span>
                        <span className="ps-staff-meta">
                          {member.active ? null : (
                            <span className="pro-pill pro-pill-neutral">{t('salon.notTakingBookings')}</span>
                          )}
                          {scores.get(member.id) ? (
                            <Rating
                              value={scores.get(member.id)!.rating}
                              count={scores.get(member.id)!.reviewCount}
                            />
                          ) : null}
                          {member.phoneVerified ? null : (
                            <span className="pro-pill pro-pill-warning">
                              {t('salon.awaitingFirstSignIn')}
                            </span>
                          )}
                          <span className="ps-staff-rate">{t('salon.commission', { value: t('salon.percentValue', { value: formatNumber(member.commissionRate) }) })}</span>
                        </span>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    </button>

                    <div className="ps-staff-foot stack-sm">
                      <Toggle
                        checked={member.active}
                        onChange={(active) => void setActive(member.id, active)}
                        label={t('salon.takingBookings')}
                      />
                      {member.active ? null : (
                        <p className="ps-inactive-note">
                          <AlertTriangle size={14} aria-hidden="true" />
                          {t('salon.inactiveNote')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <EmptyState
            icon={<Users size={26} aria-hidden="true" />}
            title={t('salon.emptyStaffTitle')}
            description={t('salon.emptyStaffBody')}
          />
        )}
      </ScreenBody>

      <StickyFooter>
        <Button block icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => setSheetOpen(true)}>
          {t('salon.addStaff')}
        </Button>
      </StickyFooter>

      <StaffFormSheet
        key={sheetKey}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setPhoneError(undefined);
          // A fresh key on the next open means a cancelled draft is gone.
          setSheetKey((value) => value + 1);
        }}
        services={services}
        saving={saving}
        phoneError={phoneError}
        onSave={(draft) => void addChair(draft)}
      />
    </Screen>
  );
}
