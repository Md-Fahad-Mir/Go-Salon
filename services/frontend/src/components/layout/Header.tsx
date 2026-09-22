import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { IconButton } from '../common/IconButton';

interface HeaderProps {
  title?: string;
  /** Show a back arrow (or an X when `close` is set). */
  back?: boolean;
  close?: boolean;
  /** Where to go when there is no in-app history to pop — a deep link, a
      refresh, an arrival from outside. Not a destination to force on somebody
      who got here by tapping through the app; they came from somewhere, and
      back means there. */
  backTo?: string;
  /** Takes over entirely, for a flow where Back is a step rather than a
      screen — a wizard going to its previous question. */
  onBack?: () => void;
  actions?: ReactNode;
  /** Float over a cover image with a gradient instead of a solid bar. */
  transparent?: boolean;
  border?: boolean;
  /** Replace the title with the Eureka word-mark (home screen). */
  brand?: boolean;
  align?: 'center' | 'start';
}

export function Header({
  title,
  back,
  close,
  backTo,
  onBack,
  actions,
  transparent,
  border,
  brand,
  align = 'center',
}: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const canPop = location.key !== 'default';

  /* History first. `backTo` used to win here, which meant every screen that
     named one threw away where the person actually came from — tap a salon
     from a scrolled search, press Back, land at the top of somewhere else. */
  const handleBack = () => {
    if (onBack) return onBack();
    if (canPop) return navigate(-1);
    if (backTo) return navigate(backTo, { replace: true });
    return navigate(ROUTES.home, { replace: true });
  };

  const showNav = back || close;

  return (
    <header
      className="header"
      data-transparent={transparent ? 'true' : undefined}
      data-border={border ? 'true' : undefined}
    >
      {showNav ? (
        <IconButton label={close ? t('action.close') : t('action.goBack')} onClick={handleBack} variant={transparent ? 'scrim' : 'plain'}>
          {close ? <X size={22} /> : <ArrowLeft size={22} />}
        </IconButton>
      ) : brand ? (
        <div className="header-brand" style={{ gridColumn: '1 / 3' }}>
          <span className="mark" aria-hidden="true">E</span>
          <span>{t('app.name')}</span>
        </div>
      ) : (
        <span className="header-spacer" aria-hidden="true" />
      )}
      {!brand ? (
        <h1 className="header-title" data-align={align}>
          {title}
        </h1>
      ) : null}
      <div className="header-actions">{actions ?? <span className="header-spacer" aria-hidden="true" />}</div>
    </header>
  );
}
