import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../hooks/useLanguage';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import type { TranslationKey } from '../../i18n';

const OPTIONS: Array<{ id: ThemePreference; labelKey: TranslationKey; icon: ReactNode }> = [
  { id: 'light', labelKey: 'settings.themeLight', icon: <Sun size={18} aria-hidden="true" /> },
  { id: 'dark', labelKey: 'settings.themeDark', icon: <Moon size={18} aria-hidden="true" /> },
  { id: 'system', labelKey: 'settings.themeSystem', icon: <Monitor size={18} aria-hidden="true" /> },
];

/** Light, dark, or follow the phone. `System` keeps tracking the OS live. */
export function AppearanceSection() {
  const { preference, resolved, setPreference } = useTheme();
  const t = useT();
  const mood = t(resolved === 'dark' ? 'settings.moodDark' : 'settings.moodLight');

  return (
    <section className="section" aria-labelledby="pf-appearance">
      <h3 className="label" id="pf-appearance">{t('settings.appearance')}</h3>
      <div className="card card-pad stack-sm">
        <div className="pf-theme" role="radiogroup" aria-label={t('settings.appearance')}>
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={preference === option.id}
              className="pf-theme-option"
              onClick={() => setPreference(option.id)}
            >
              {option.icon}
              <span>{t(option.labelKey)}</span>
            </button>
          ))}
        </div>
        <p className="field-hint">
          {preference === 'system'
            ? t('settings.themeFollowing', { mood })
            : t('settings.themeFixed', { mood })}
        </p>
      </div>
    </section>
  );
}
