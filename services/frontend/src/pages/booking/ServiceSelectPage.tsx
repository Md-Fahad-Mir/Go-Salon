import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookingStepHeader } from '../../components/booking/BookingStepHeader';
import { ServiceOption } from '../../components/booking/ServiceOption';
import { useWizardStep } from '../../components/booking/useWizardStep';
import { ProfessionalNotFound, WizardLoading } from '../../components/booking/WizardShell';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import type { Service } from '../../types';
import { firstNameOf, formatBdt, formatDuration, formatNumber } from '../../utils/format';

export default function ServiceSelectPage() {
  const { professionalId = '' } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { resolving,
    ready, exists, draft, professional, allServices, services, subtotal, duration,
    staffMember, toggleService, setServices, rescheduleOf, hairstyleId,
  } = useWizardStep(professionalId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const preselected = useRef(false);
  const selectedCount = draft?.serviceIds.length ?? 0;

  // Coming from a try-on: tick the matching service once, and only when the
  // draft is still empty so a deliberate deselect stays deselected.
  useEffect(() => {
    if (!ready || !hairstyleId || preselected.current) return;
    preselected.current = true;
    if (selectedCount > 0) return;
    const match = allServices.find((service) => service.hairstyleIds.includes(hairstyleId));
    if (match) setServices([match.id]);
  }, [allServices, hairstyleId, ready, selectedCount, setServices]);

  /* The stylist is chosen first now, so the menu is theirs.
     `staffIds` empty means the salon cleared everybody for it — inverting that
     reading is the one mistake that would hide a whole price list, so it is
     spelled out rather than folded into the filter. The server keeps its own
     intersection regardless; this only stops a customer assembling a basket
     nobody can perform and meeting an unexplained empty calendar. */
  const chairId = draft?.staffId ?? 'any';
  const mine = useMemo(
    () => allServices.filter((service) =>
      chairId === 'any' || !service.staffIds.length || service.staffIds.includes(chairId)),
    [allServices, chairId],
  );

  const groups = useMemo(() => {
    const byCategory = new Map<string, Service[]>();
    for (const service of mine) {
      byCategory.set(service.category, [...(byCategory.get(service.category) ?? []), service]);
    }
    return Array.from(byCategory.entries());
  }, [mine]);

  if (resolving) return <WizardLoading title={t('booking.preparing')} />;
  if (!exists) return <ProfessionalNotFound />;
  if (rescheduleOf) return <Navigate to={ROUTES.bookingDateTime(professionalId)} replace />;
  if (!ready || !draft || !professional) return <WizardLoading title={t('booking.services')} />;

  const canContinue = services.length > 0;

  return (
    <Screen className="bk-step bk-step-menu">
      <BookingStepHeader title={professional.name} step={2} label={t('booking.services')} />
      <ScreenBody>
        <div className="bk-intro">
          <h2>{t('booking.serviceTitle')}</h2>
          <p className="caption">
            {staffMember
              ? t('booking.serviceSubtitleStaff', { name: firstNameOf(staffMember.name) })
              : t('booking.serviceSubtitle')}
          </p>
        </div>
        {/* A stylist cleared for nothing is a salon misconfiguration, and the
            calendar after it would be blank with no explanation. Say it here,
            where going back one step actually fixes it. */}
        {!groups.length ? (
          <Callout tone="warning" icon={<AlertCircle size={18} aria-hidden="true" />}>
            {staffMember
              ? t('booking.noServicesForStaff', { name: firstNameOf(staffMember.name) })
              : t('booking.noServicesAtAll')}
          </Callout>
        ) : null}
        {groups.map(([category, items]) => (
          <div key={category} className="bk-group" role="group" aria-label={category}>
            <span className="label">{category}</span>
            {items.map((service) => (
              <ServiceOption
                key={service.id}
                service={service}
                selected={draft.serviceIds.includes(service.id)}
                expanded={expanded === service.id}
                onToggle={() => toggleService(service.id)}
                onExpand={() => setExpanded((current) => (current === service.id ? null : service.id))}
                matchesTryOn={Boolean(hairstyleId && service.hairstyleIds.includes(hairstyleId))}
              />
            ))}
          </div>
        ))}
      </ScreenBody>
      <StickyFooter
        meta={
          <>
            <span aria-live="polite">
              {canContinue
                ? t('booking.serviceFooter', { count: formatNumber(services.length), duration: formatDuration(duration) })
                : t('booking.pickOneService')}
            </span>
            <strong>{formatBdt(subtotal)}</strong>
          </>
        }
      >
        <Button block size="lg" disabled={!canContinue} onClick={() => navigate(ROUTES.bookingDateTime(professionalId))}>
          {t('action.continue')}
        </Button>
      </StickyFooter>
    </Screen>
  );
}
