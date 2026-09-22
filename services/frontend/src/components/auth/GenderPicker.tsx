import { UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { useT } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import type { Gender } from '../../types';

const OPTIONS: Array<{ id: Gender; labelKey: TranslationKey; hintKey: TranslationKey; icon: LucideIcon }> = [
  { id: 'male', labelKey: 'auth.genderMale', hintKey: 'auth.genderMaleHint', icon: UserRound },
  { id: 'female', labelKey: 'auth.genderFemale', hintKey: 'auth.genderFemaleHint', icon: Users },
];

interface GenderPickerProps {
  value: Gender | undefined;
  onChange: (gender: Gender) => void;
  /** Hide the explanatory line where the surrounding screen already says it. */
  hint?: boolean;
  labelKey?: TranslationKey;
}

/** Two tiles. This is the one choice that decides which half of the catalogue
    a customer sees, so it is given room rather than buried in a select. */
export function GenderPicker({ value, onChange, hint = true, labelKey = 'auth.genderLabel' }: GenderPickerProps) {
  const t = useT();
  const labelId = useId();
  return (
    <div className="field">
      <span className="field-label" id={labelId}>{t(labelKey)}</span>
      <div className="auth-gender" role="radiogroup" aria-labelledby={labelId}>
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value === option.id}
              className="auth-gender-option"
              onClick={() => onChange(option.id)}
            >
              <span className="auth-gender-icon" aria-hidden="true"><Icon size={22} /></span>
              <strong>{t(option.labelKey)}</strong>
              <small>{t(option.hintKey)}</small>
            </button>
          );
        })}
      </div>
      {hint ? <p className="field-hint">{t('auth.genderHint')}</p> : null}
    </div>
  );
}
