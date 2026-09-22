import { WifiOff } from 'lucide-react';
import { useT } from '../../hooks/useLanguage';
import { useOnline } from '../../hooks/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  const t = useT();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={15} aria-hidden="true" /> {t('error.offline')}
    </div>
  );
}
