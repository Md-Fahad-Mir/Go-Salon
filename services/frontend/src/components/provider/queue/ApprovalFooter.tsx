import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../../hooks/useLanguage';
import { useAppStore } from '../../../store/useAppStore';
import { useProviderStore } from '../../../store/useProviderStore';
import { messageOf } from '../../../utils/errorMessage';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Callout } from '../../common/Callout';
import { Textarea } from '../../common/Input';
import { FooterRow, StickyFooter } from '../../layout/StickyFooter';

interface ApprovalFooterProps {
  appointmentId: string;
  customerName: string;
  onDone?: () => void;
}

/** Saying yes or no to a booking that is waiting.
 *
 *  Both answers text the customer, and the toast says whether that text
 *  actually went out — a salon that thinks somebody was told when the gateway
 *  was down will have an empty chair and no idea why.
 *
 *  A rejection needs a reason because the customer is sent it word for word.
 */
export function ApprovalFooter({ appointmentId, customerName, onDone }: ApprovalFooterProps) {
  const t = useT();
  const toast = useAppStore((s) => s.toast);
  const approve = useProviderStore((s) => s.approveAppointment);
  const reject = useProviderStore((s) => s.rejectAppointment);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const tellThem = (done: string, result: { notified: boolean; error?: string }) => {
    toast(
      result.notified ? 'success' : 'warning',
      done,
      result.notified
        ? t('booking.textSent', { name: customerName })
        : t('booking.textFailed', { name: customerName }),
    );
  };

  const yes = async () => {
    setBusy(true);
    try {
      tellThem(t('booking.approvedToast'), await approve(appointmentId));
      onDone?.();
    } catch (error) {
      toast('error', t('state.saveFailed'), messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const no = async () => {
    setTouched(true);
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      tellThem(t('booking.rejectedToast'), await reject(appointmentId, reason.trim()));
      setRejecting(false);
      onDone?.();
    } catch (error) {
      toast('error', t('state.saveFailed'), messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StickyFooter>
        <Button
          block
          size="lg"
          icon={<Check size={20} aria-hidden="true" />}
          loading={busy && !rejecting}
          onClick={() => void yes()}
        >
          {t('booking.approve')}
        </Button>
        <FooterRow>
          <Button
            variant="danger-soft"
            icon={<X size={18} aria-hidden="true" />}
            onClick={() => setRejecting(true)}
          >
            {t('booking.reject')}
          </Button>
        </FooterRow>
      </StickyFooter>

      <BottomSheet
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={t('booking.rejectTitle')}
        description={t('booking.rejectBody')}
        footer={
          <>
            <Button variant="danger-soft" block loading={busy} onClick={() => void no()}>
              {t('booking.reject')}
            </Button>
            <Button variant="ghost" block onClick={() => setRejecting(false)}>
              {t('action.cancel')}
            </Button>
          </>
        }
      >
        <div className="stack-sm">
          <Callout tone="info">{t('booking.rejectBody')}</Callout>
          <Textarea
            label={t('booking.rejectReason')}
            placeholder={t('booking.rejectPlaceholder')}
            rows={3}
            value={reason}
            maxLength={300}
            error={touched && reason.trim().length < 3 ? t('booking.rejectReason') : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </BottomSheet>
    </>
  );
}
