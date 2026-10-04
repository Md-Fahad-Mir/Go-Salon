import { Moon, Sun } from 'lucide-react';
import { useT } from '../../hooks/useLanguage';
import { useTheme } from '../../hooks/useTheme';
import { IconButton } from '../common/IconButton';

interface ThemeSwitchButtonProps {
  variant?: 'plain' | 'scrim';
}

/** Flips light and dark in one tap, from a button in the home screen's
    header — the customer's Home, and each professional's home screen. The
    only way to change it: no Settings screen has an appearance section any
    more. Until the first tap the app follows the phone; after that it stays
    on the side picked. The icon shows the mood the screen is in now. */
export function ThemeSwitchButton({ variant = 'plain' }: ThemeSwitchButtonProps) {
  const { resolved, setPreference } = useTheme();
  const t = useT();
  const next = resolved === 'dark' ? 'light' : 'dark';

  return (
    <IconButton
      label={t(next === 'dark' ? 'settings.switchToDark' : 'settings.switchToLight')}
      variant={variant}
      onClick={() => setPreference(next)}
    >
      {resolved === 'dark' ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
    </IconButton>
  );
}
