import { useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import type { Audience } from '../../types';
import { textProblem, yearsProblem } from '../../utils/validators';
import { Chip, ChipRow } from '../common/Chip';
import { Input } from '../common/Input';
import { ChoiceList } from './ChoiceList';
import { BARBER_SERVICES } from './registerOptions';

interface RegisterStepBarberProps {
  audience: Audience | undefined;
  businessName: string;
  experience: string;
  serviceIds: string[];
  onAudience: (value: Audience) => void;
  onBusinessName: (value: string) => void;
  onExperience: (value: string) => void;
  onToggleService: (id: string) => void;
}

/** What a barber or hairstylist does, and who for. `audience` is the only
    question that separates a gents barber from a women's hairstylist — they
    are the same kind of account, doing the same job for different clients. */
export function RegisterStepBarber({
  audience,
  businessName,
  experience,
  serviceIds,
  onAudience,
  onBusinessName,
  onExperience,
  onToggleService,
  showErrors,
}: RegisterStepBarberProps & { showErrors: boolean }) {
  const t = useT();
  const [experienceTouched, setExperienceTouched] = useState(false);

  const years = yearsProblem(experience);
  const nameIssue = businessName.trim() ? textProblem(businessName, { max: 60 }) : undefined;

  return (
    <div className="auth-step stack-lg">
      <div className="auth-intro">
        <h2 tabIndex={-1}>{t('auth.barberWorkTitle')}</h2>
        <p>{t('auth.barberWorkSub')}</p>
      </div>

      <ChoiceList<Audience>
        label={t('auth.clientsLabel')}
        hint={t('auth.clientsHint')}
        error={showErrors && !audience ? t('auth.errClients') : undefined}
        value={audience}
        onChange={onAudience}
        options={[
          { id: 'men', label: t('auth.clientsMen'), hint: t('auth.clientsMenHint') },
          { id: 'women', label: t('auth.clientsWomen'), hint: t('auth.clientsWomenHint') },
          { id: 'unisex', label: t('auth.clientsAll'), hint: t('auth.clientsAllHint') },
        ]}
      />

      <div className="stack">
        <Input
          label={t('auth.tradingName')}
          optional
          value={businessName}
          onChange={(event) => onBusinessName(event.target.value)}
          error={showErrors && nameIssue ? t('auth.errTradingNameLong') : undefined}
          hint={t('auth.tradingNameHint')}
          placeholder={t('auth.tradingNamePlaceholder')}
          maxLength={60}
        />
        <Input
          label={t('auth.experienceLabel')}
          value={experience}
          onChange={(event) => onExperience(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => setExperienceTouched(true)}
          error={(experienceTouched || showErrors) && years ? t('auth.errExperience') : undefined}
          inputMode="numeric"
          suffix={<span className="dim">{t('auth.years')}</span>}
          maxLength={2}
        />
      </div>

      <div className="stack-sm">
        <span className="field-label" id="auth-services">{t('auth.servicesLabel')}</span>
        <ChipRow label={t('auth.servicesLabel')}>
          {BARBER_SERVICES.map((service) => (
            <Chip
              key={service.id}
              active={serviceIds.includes(service.id)}
              onClick={() => onToggleService(service.id)}
            >
              {service.name}
            </Chip>
          ))}
        </ChipRow>
        {showErrors && !serviceIds.length ? (
          <p className="field-error" role="alert">{t('auth.errServices')}</p>
        ) : (
          <p className="field-hint">{t('auth.servicesHint')}</p>
        )}
      </div>
    </div>
  );
}
