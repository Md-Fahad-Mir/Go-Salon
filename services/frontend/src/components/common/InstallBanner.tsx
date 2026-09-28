import { Share, SquarePlus, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useInstallStore } from '../../store/useInstallStore';
import {
  currentDevice,
  inJoinJourney,
  isAndroid,
  isIosSafari,
  isStandalone,
} from '../../utils/installPlatform';
import { RichText } from '../auth/RichText';
import { Button } from './Button';
import { IconButton } from './IconButton';

/* The offer to add the app to the home screen, for somebody who has just
   scanned a salon's code in a browser.

   Mounted once, in `AppFrame`, rather than on the screens it appears over —
   one instance for the whole journey, so it does not flicker or reset as the
   person goes from the code to sign-in and back. It decides for itself when
   to render, and renders nothing:

     - off the join journey (Home, Booking, Profile and the rest never see it)
     - when already running as the installed app
     - once installed, or once "not now" was said this session
     - on a desktop. A QR code is scanned by a phone, and a desktop install of
       an app drawn for a 480px column is not what this flow is for. Chrome
       fires the event on desktop too; it is caught and simply not used.
     - on a phone that cannot install from here: Android with no event (Chrome
       sends none when the app is already installed), or an iOS browser that
       is not Safari. */
export function InstallBanner() {
  const t = useT();
  const { pathname } = useLocation();
  const pendingRedirect = useAppStore((s) => s.pendingRedirect);
  const deferred = useInstallStore((s) => s.deferred);
  const installed = useInstallStore((s) => s.installed);
  const dismissed = useInstallStore((s) => s.dismissed);
  const dismiss = useInstallStore((s) => s.dismiss);
  const install = useInstallStore((s) => s.install);

  if (!inJoinJourney(pathname, pendingRedirect) || installed || dismissed || isStandalone()) {
    return null;
  }
  const device = currentDevice();
  const mode = deferred && isAndroid(device) ? 'prompt' : isIosSafari(device) ? 'ios' : null;
  if (mode === null) return null;

  return (
    <aside className="install-banner" aria-labelledby="install-title">
      <img className="install-icon" src="/icons/icon-192.png" alt="" width={40} height={40} />
      <div className="install-body">
        <p className="install-title" id="install-title">{t('tenant.installTitle')}</p>
        {mode === 'prompt' ? (
          <>
            <p className="install-text">{t('tenant.installBody')}</p>
            <Button size="sm" onClick={() => void install()}>{t('tenant.installAction')}</Button>
          </>
        ) : (
          <p className="install-text">
            <RichText
              template={t('tenant.installIosSteps')}
              nodes={{
                share: <Share size={16} className="install-glyph" aria-hidden="true" />,
                add: <SquarePlus size={16} className="install-glyph" aria-hidden="true" />,
              }}
            />
          </p>
        )}
      </div>
      <IconButton label={t('tenant.installDismiss')} onClick={dismiss}>
        <X size={18} />
      </IconButton>
    </aside>
  );
}
