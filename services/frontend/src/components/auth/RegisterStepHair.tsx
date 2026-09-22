import type { Gender, HairLength, HairType } from '../../types';
import { HAIR_LENGTHS, HAIR_TYPES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { GenderPicker } from './GenderPicker';
import { HairTypeIcon } from './HairTypeIcon';
import {
  HAIR_LENGTH_HINT_KEYS,
  HAIR_LENGTH_KEYS,
  HAIR_TYPE_HINT_KEYS,
  HAIR_TYPE_KEYS,
} from './labels';

interface RegisterStepHairProps {
  gender?: Gender;
  hairType?: HairType;
  hairLength?: HairLength;
  onGender: (value: Gender) => void;
  onHairType: (value: HairType) => void;
  onHairLength: (value: HairLength) => void;
}

export function RegisterStepHair({
  gender,
  hairType,
  hairLength,
  onGender,
  onHairType,
  onHairLength,
}: RegisterStepHairProps) {
  const t = useT();
  return (
    <div className="auth-step stack-lg">
      <div className="auth-intro">
        <h2 tabIndex={-1}>{t('auth.hairTitle')}</h2>
        <p>{t('auth.hairSub')}</p>
      </div>

      <GenderPicker value={gender} onChange={onGender} />

      <span className="pf-field-label">{t('auth.hairTypeHeading')}</span>
      <div className="tile-grid" role="group" aria-label={t('auth.hairTypeGroup')}>
        {HAIR_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className="tile"
            aria-pressed={hairType === type.id}
            onClick={() => onHairType(type.id)}
          >
            <span className="tile-icon auth-tile-icon">
              <HairTypeIcon type={type.id} />
            </span>
            <span className="tile-title">{t(HAIR_TYPE_KEYS[type.id])}</span>
            <span className="tile-sub">{t(HAIR_TYPE_HINT_KEYS[type.id])}</span>
          </button>
        ))}
      </div>

      <div className="stack-sm">
        <h3>{t('auth.preferredLength')}</h3>
        <div className="tile-grid tile-grid-3 auth-length-grid" role="group" aria-label={t('auth.hairLengthGroup')}>
          {HAIR_LENGTHS.map((length) => (
            <button
              key={length.id}
              type="button"
              className="tile"
              aria-pressed={hairLength === length.id}
              onClick={() => onHairLength(length.id)}
            >
              <span className="tile-title">{t(HAIR_LENGTH_KEYS[length.id])}</span>
              <span className="tile-sub">{t(HAIR_LENGTH_HINT_KEYS[length.id])}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="small dim">{t('auth.hairFoot')}</p>
    </div>
  );
}
