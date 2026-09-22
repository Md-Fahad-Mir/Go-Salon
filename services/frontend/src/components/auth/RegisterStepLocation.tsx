import { AlertCircle, Check, LocateFixed } from 'lucide-react';
import { DHAKA_AREAS } from '../../constants';
import type { GeoStatus } from '../../hooks/useGeolocation';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { Chip, ChipRow } from '../common/Chip';
import { RichText } from './RichText';
import { AREA_KEYS, areaLabel, type DhakaArea } from './areas';

interface RegisterStepLocationProps {
  geoStatus: GeoStatus;
  geoError?: string;
  /** Area name resolved from the device fix, once granted. */
  geoArea?: string;
  area?: DhakaArea;
  terms: boolean;
  onLocate: () => void;
  onArea: (area: DhakaArea) => void;
  onTerms: (checked: boolean) => void;
  /* A customer is asked where they are so salons can be sorted by distance;
     a professional is asked where they work so customers can find them. Same
     controls, different reason, so the heading is the caller's to set. */
  titleKey?: TKey;
  subKey?: TKey;
  geoHintKey?: TKey;
}

export function RegisterStepLocation({
  geoStatus,
  geoError,
  geoArea,
  area,
  terms,
  onLocate,
  onArea,
  onTerms,
  titleKey = 'auth.locationTitle',
  subKey = 'auth.locationSub',
  geoHintKey = 'auth.geoHint',
}: RegisterStepLocationProps) {
  const t = useT();
  const locating = geoStatus === 'locating';
  const failed = geoStatus === 'denied' || geoStatus === 'unsupported';

  /* `useGeolocation` reports the reason in English. We keep its distinction
     between a refused permission and a failed fix, but say it in our words. */
  const failure =
    geoStatus === 'unsupported'
      ? t('auth.geoUnsupported')
      : geoError?.startsWith('Location access')
        ? t('auth.geoDenied')
        : t('auth.geoNoFix');

  return (
    <div className="auth-step stack-lg">
      <div className="auth-intro">
        <h2 tabIndex={-1}>{t(titleKey)}</h2>
        <p>{t(subKey)}</p>
      </div>

      <div className="stack-sm">
        <Button
          variant="secondary"
          block
          icon={<LocateFixed size={18} aria-hidden="true" />}
          onClick={onLocate}
          loading={locating}
        >
          {t('auth.useMyLocation')}
        </Button>
        <p className="auth-geo-status" data-tone={geoStatus === 'granted' ? 'success' : failed ? 'danger' : undefined} aria-live="polite">
          {locating ? (
            t('auth.geoLocating')
          ) : geoStatus === 'granted' ? (
            <>
              <Check size={16} aria-hidden="true" />{' '}
              {geoArea ? t('auth.geoSetNear', { area: areaLabel(t, geoArea) }) : t('auth.geoSet')}
            </>
          ) : failed ? (
            <>
              <AlertCircle size={16} aria-hidden="true" /> {failure}
            </>
          ) : (
            t(geoHintKey)
          )}
        </p>
      </div>

      <div className="stack-sm">
        <h3>{t('auth.pickArea')}</h3>
        <ChipRow label={t('auth.areaGroup')}>
          {DHAKA_AREAS.map((option) => (
            <Chip key={option} active={area === option} onClick={() => onArea(option)}>
              {t(AREA_KEYS[option])}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <Checkbox
        checked={terms}
        onChange={onTerms}
        label={
          <RichText
            template={t('auth.agreeTerms')}
            nodes={{
              terms: <span className="auth-link">{t('auth.termsOfService')}</span>,
              privacy: <span className="auth-link">{t('auth.privacy')}</span>,
            }}
          />
        }
      />
    </div>
  );
}
