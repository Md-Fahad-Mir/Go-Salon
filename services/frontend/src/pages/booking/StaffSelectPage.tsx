import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookingStepHeader } from '../../components/booking/BookingStepHeader';
import { StaffOption } from '../../components/booking/StaffOption';
import { useWizardStep } from '../../components/booking/useWizardStep';
import { ProfessionalNotFound, WizardLoading } from '../../components/booking/WizardShell';
import { Button } from '../../components/common/Button';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { firstNameOf } from '../../utils/format';

export default function StaffSelectPage() {
  const { professionalId = '' } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { resolving, ready, exists, draft, professional, staff, staffMember, setStaff, rescheduleOf } =
    useWizardStep(professionalId);

  if (resolving) return <WizardLoading title={t('booking.preparing')} />;
  if (!exists) return <ProfessionalNotFound />;
  if (rescheduleOf) return <Navigate to={ROUTES.bookingDateTime(professionalId)} replace />;
  if (!ready || !draft || !professional) return <WizardLoading title={t('booking.stylist')} />;

  return (
    <Screen className="bk-step bk-step-who">
      <BookingStepHeader title={professional.name} step={1} label={t('booking.stylist')} />
      <ScreenBody>
        <div className="bk-intro">
          <h2>{t('booking.staffTitle')}</h2>
          <p className="caption">{t('booking.staffSubtitle')}</p>
        </div>
        <div className="stack-sm stagger" role="radiogroup" aria-label={t('booking.stylist')}>
          <StaffOption selected={draft.staffId === 'any'} onSelect={() => setStaff('any')} />
          {staff.map((member) => (
            <StaffOption
              key={member.id}
              member={member}
              selected={draft.staffId === member.id}
              onSelect={() => setStaff(member.id)}
            />
          ))}
        </div>
      </ScreenBody>
      <StickyFooter
        meta={
          <>
            <span aria-live="polite">
              {staffMember ? t('booking.withStylist', { name: firstNameOf(staffMember.name) }) : t('booking.anyone')}
            </span>
          </>
        }
      >
        <Button block size="lg" onClick={() => navigate(ROUTES.bookingService(professionalId))}>
          {t('action.continue')}
        </Button>
      </StickyFooter>
    </Screen>
  );
}
