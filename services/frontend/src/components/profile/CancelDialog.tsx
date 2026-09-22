import { AlertTriangle, CheckCircle2, Phone } from 'lucide-react';
import { useState } from 'react';
import type { Booking } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../utils/api';
import { callToCancelOf } from '../../utils/bookingService';
import { messageOf } from '../../utils/errorMessage';
import { formatBdt, formatNumber, formatPhone } from '../../utils/format';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { Callout } from '../common/Callout';
import { Select } from '../common/Input';
import { CANCEL_REASONS, cancelReasonLabel, isInsideCancelWindow, servicesLabel } from './bookingHelpers';

interface CancelDialogProps {
  booking: Booking;
  open: boolean;
  onClose: () => void;
  onCancelled?: () => void;
}

/** Calling a booking off.
 *
 *  Ringing the salon leads, whichever side of the deadline this is. A chair
 *  has been set aside for someone by name, and a person who cannot make it
 *  owes them a word — a row quietly flipping to `cancelled` is not that.
 *
 *  Inside the window the customer may also cancel here with a reason. Past it
 *  the phone is the only way, which is what the server says too: it answers a
 *  late cancel with `call_to_cancel` and the number to dial.
 */
export function CancelDialog({ booking, open, onClose, onCancelled }: CancelDialogProps) {
  const rememberBooking = useAppStore((s) => s.rememberBooking);
  const toast = useAppStore((s) => s.toast);
  const t = useT();

  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [busy, setBusy] = useState(false);
  /** Set when the server refuses a late cancel and hands back a number. */
  const [mustCall, setMustCall] = useState<{ name: string; phone: string } | null>(null);

  const tooLate = isInsideCancelWindow(booking) || booking.can.callToCancel || mustCall !== null;
  const phone = mustCall?.phone || booking.businessPhone;
  const name = mustCall?.name || booking.professionalName;

  const confirm = async () => {
    setBusy(true);
    try {
      const cancelled = await api.bookings.cancel(booking.id, reason);
      rememberBooking(cancelled);
      toast('success', t('bookings.cancelledToast'), t('bookings.refundFull'));
      onClose();
      onCancelled?.();
    } catch (error) {
      // The deadline may have passed while this sheet was open.
      const call = callToCancelOf(error);
      if (call) setMustCall({ name: call.businessName, phone: call.businessPhone });
      else toast('error', t('state.saveFailed'), messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={tooLate ? t('booking.callToCancelTitle', { name }) : t('bookings.cancelTitle')}
      description={t('bookings.servicesAt', {
        services: servicesLabel(booking),
        pro: booking.professionalName,
      })}
      footer={
        <>
          {phone ? (
            <a className="btn btn-primary btn-block btn-lg" href={`tel:${phone}`}>
              <Phone size={18} aria-hidden="true" /> {t('booking.callSalon', { name })}
            </a>
          ) : null}
          {tooLate ? null : (
            <Button variant="danger-soft" block loading={busy} onClick={() => void confirm()}>
              {t('booking.cancelAnyway')}
            </Button>
          )}
          <Button variant="ghost" block onClick={onClose}>{t('bookings.keepIt')}</Button>
        </>
      }
    >
      <div className="stack-sm pf-cancel">
        {tooLate ? (
          <Callout tone="warning" icon={<AlertTriangle size={16} aria-hidden="true" />}>
            {t('booking.callToCancelBody', {
              hours: formatNumber(booking.cancellationWindowHours),
            })}
          </Callout>
        ) : (
          <>
            <Callout tone="success" icon={<CheckCircle2 size={16} aria-hidden="true" />}>
              {t('bookings.cancelFree', { total: formatBdt(booking.total) })}
            </Callout>
            <Select
              label={t('booking.cancelWhy')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              options={CANCEL_REASONS.map((r) => ({ value: r, label: cancelReasonLabel(r, t) }))}
            />
          </>
        )}
        {phone ? <p className="caption dim center">{formatPhone(phone)}</p> : null}
      </div>
    </BottomSheet>
  );
}
