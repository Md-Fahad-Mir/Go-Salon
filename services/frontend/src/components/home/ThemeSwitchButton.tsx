import { Check, Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import type { TranslationKey } from '../../i18n';
import { BottomSheet } from '../common/BottomSheet';
import { IconButton } from '../common/IconButton';

interface ThemeSwitchButtonProps {
  variant?: 'plain' | 'scrim';
}

const OPTIONS: Array<{ id: ThemePreference; labelKey: TranslationKey; icon: ReactNode }> = [
  { id: 'light', labelKey: 'settings.themeLight', icon: <Sun size={18} aria-hidden="true" /> },
  { id: 'dark', labelKey: 'settings.themeDark', icon: <Moon size={18} aria-hidden="true" /> },
  { id: 'system', labelKey: 'settings.themeSystem', icon: <Monitor size={18} aria-hidden="true" /> },
];

/** Light, dark, or follow the phone, from a button in the home screen's
    header — the customer's Home, and each professional's home screen. The
    only way to change it: no Settings screen has an appearance section any
    more. The icon shows the mood the screen is in now. */
export function ThemeSwitchButton({ variant = 'plain' }: ThemeSwitchButtonProps) {
  const { preference, resolved, setPreference } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const mood = t(resolved === 'dark' ? 'settings.moodDark' : 'settings.moodLight');

  const choose = (id: ThemePreference) => {
    setPreference(id);
    setOpen(false);
  };

  return (
    <>
      <IconButton label={t('settings.appearance')} variant={variant} onClick={() => setOpen(true)}>
        {resolved === 'dark' ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
      </IconButton>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('settings.appearance')}
        description={
          preference === 'system'
            ? t('settings.themeFollowing', { mood })
            : t('settings.themeFixed', { mood })
        }
      >
        <div className="list-card" role="radiogroup" aria-label={t('settings.appearance')}>
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="list-row"
              role="radio"
              aria-checked={preference === option.id}
              onClick={() => choose(option.id)}
            >
              <span className="list-row-icon">{option.icon}</span>
              <span className="list-row-body">
                <span className="list-row-title">{t(option.labelKey)}</span>
              </span>
              <span className="list-row-end">
                {preference === option.id ? (
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
