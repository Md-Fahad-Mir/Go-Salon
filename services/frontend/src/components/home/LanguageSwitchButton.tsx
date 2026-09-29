import { Check, Languages } from 'lucide-react';
import { useState } from 'react';
import { LANGUAGES } from '../../i18n';
import { useLanguage } from '../../hooks/useLanguage';
import { BottomSheet } from '../common/BottomSheet';
import { IconButton } from '../common/IconButton';

interface LanguageSwitchButtonProps {
  variant?: 'plain' | 'scrim';
}

/** English or বাংলা, from the button beside Home's notification bell. The
    customer's only way to change the language — their Settings has no
    language section. (Providers keep `LanguageSection` in their own
    settings, since they have no Home.) */
export function LanguageSwitchButton({ variant = 'plain' }: LanguageSwitchButtonProps) {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);

  const choose = (id: (typeof LANGUAGES)[number]['id']) => {
    setLanguage(id);
    setOpen(false);
  };

  return (
    <>
      <IconButton label={t('settings.language')} variant={variant} onClick={() => setOpen(true)}>
        <Languages size={20} aria-hidden="true" />
      </IconButton>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('settings.language')}>
        <div className="list-card" role="radiogroup" aria-label={t('settings.language')}>
          {LANGUAGES.map((option) => (
            <button
              key={option.id}
              type="button"
              className="list-row"
              role="radio"
              aria-checked={language === option.id}
              onClick={() => choose(option.id)}
            >
              <span className="list-row-icon">
                <Languages size={18} aria-hidden="true" />
              </span>
              <span className="list-row-body">
                <span className="list-row-title">{option.nativeLabel}</span>
                <span className="list-row-sub">{option.label}</span>
              </span>
              <span className="list-row-end">
                {language === option.id ? (
                  <Check size={20} aria-hidden="true" style={{ color: 'var(--accent-ink)' }} />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
