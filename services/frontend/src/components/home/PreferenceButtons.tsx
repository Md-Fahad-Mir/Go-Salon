import { LanguageSwitchButton } from './LanguageSwitchButton';
import { ThemeSwitchButton } from './ThemeSwitchButton';

/** Light/dark and language, as a header's actions. A professional has no
    Settings screen, so every tab of theirs carries these two in its header —
    one component so the pair stays in the same order everywhere. */
export function PreferenceButtons({ variant = 'plain' }: { variant?: 'plain' | 'scrim' }) {
  return (
    <>
      <ThemeSwitchButton variant={variant} />
      <LanguageSwitchButton variant={variant} />
    </>
  );
}
