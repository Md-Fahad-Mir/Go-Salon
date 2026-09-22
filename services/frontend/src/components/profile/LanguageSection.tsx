import { Check, Languages } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { LANGUAGES } from '../../i18n';

/** English or Bangla. The choice is stored on the device and applies at once —
    strings, month names, and Bengali numerals on prices. */
export function LanguageSection() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <section className="section" aria-labelledby="pf-language">
      <h3 className="label" id="pf-language">{t('settings.language')}</h3>
      <div className="list-card">
        {LANGUAGES.map((option) => (
          <button
            key={option.id}
            type="button"
            className="list-row"
            role="radio"
            aria-checked={language === option.id}
            onClick={() => setLanguage(option.id)}
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
    </section>
  );
}
