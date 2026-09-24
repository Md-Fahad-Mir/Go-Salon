import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../common/Button';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { EmptyState } from '../../common/EmptyState';
import { Spinner } from '../../common/Spinner';
import { useT } from '../../../hooks/useLanguage';
import { useAppStore } from '../../../store/useAppStore';
import { messageOf } from '../../../utils/errorMessage';
import { downloadBlob } from '../../../utils/share';
import { tenantService } from '../../../utils/tenantService';

/* The code a customer scans to add this salon.

   Owner-only, and about whichever salon is active: the endpoints are guarded
   by `OwnsTenant` behind `TenantContext`, and `apiClient` puts the active
   tenant on every request — so an owner of two shops gets the code for the
   one the switcher has chosen, with nothing here to arrange it.

   Fetched fresh on every mount and never cached. The server sends
   `Cache-Control: no-store` because the token behind the image can be rotated
   at any moment, and a screen holding yesterday's PNG would be showing a
   door that no longer opens. The object URL is revoked when it is replaced or
   when the screen goes, so regenerating twice does not leak two of them. */
export function SalonQRSection() {
  const t = useT();
  const toast = useAppStore((s) => s.toast);

  const [src, setSrc] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /** The object URL currently on screen, so it can be revoked on the way out
      rather than left for the tab to forget about. */
  const objectUrl = useRef<string | null>(null);

  const show = (image: Blob) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(image);
    objectUrl.current = url;
    setBlob(image);
    setSrc(url);
  };

  useEffect(() => {
    let live = true;
    tenantService
      .qr()
      .then((image) => {
        if (!live) return;
        show(image);
        setFailure(null);
      })
      .catch((error: unknown) => live && setFailure(messageOf(error)));
    return () => {
      live = false;
    };
  }, [attempt]);

  // Only on the way out: replacing one mid-session is handled by `show`.
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const save = () => {
    if (!blob) return;
    downloadBlob('eureka-join-code.png', blob);
    toast('success', t('tenant.qrSaved'));
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      show(await tenantService.regenerateQr());
      setFailure(null);
      toast('success', t('tenant.qrRegenerated'));
    } catch {
      // The old token is untouched when the call fails, so the code already
      // on the wall is still the live one — which is the reassuring half of
      // an otherwise unreassuring action, and worth saying.
      toast('error', t('tenant.qrRegenerateFailed'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className="section" aria-labelledby="salon-qr">
      <h3 className="label" id="salon-qr">{t('tenant.qrTitle')}</h3>

      {failure !== null ? (
        <EmptyState
          icon={<AlertTriangle size={26} aria-hidden="true" />}
          tone="danger"
          title={t('tenant.qrErrTitle')}
          description={failure}
          /* Clearing here rather than at the top of the effect: a synchronous
             setState inside one is what makes a render cascade, and asking
             again is something a person does, not something a render does. */
          action={
            <Button
              onClick={() => {
                setFailure(null);
                setSrc(null);
                setAttempt((n) => n + 1);
              }}
            >
              {t('state.retry')}
            </Button>
          }
        />
      ) : src === null ? (
        <div className="fullscreen-center" aria-busy="true">
          <Spinner size="lg" label={t('state.loading')} />
        </div>
      ) : (
        <div className="stack">
          <img src={src} alt={t('tenant.qrAlt')} width={240} height={240} />
          <p className="small muted">{t('tenant.qrHint')}</p>
          <div className="grid-2">
            <Button
              variant="secondary"
              icon={<Download size={16} aria-hidden="true" />}
              onClick={save}
            >
              {t('tenant.qrSave')}
            </Button>
            <Button
              variant="danger-soft"
              icon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => setConfirming(true)}
            >
              {t('tenant.qrRegenerate')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void regenerate()}
        title={t('tenant.qrRegenerateTitle')}
        description={t('tenant.qrRegenerateBody')}
        confirmLabel={t('tenant.qrRegenerateConfirm')}
        tone="danger"
        loading={busy}
        icon={
          <span className="icon-circle icon-circle-danger">
            <RefreshCw size={24} aria-hidden="true" />
          </span>
        }
      />
    </section>
  );
}
