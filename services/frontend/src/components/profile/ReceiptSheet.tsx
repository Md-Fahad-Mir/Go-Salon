import { Share2 } from 'lucide-react';
import type { Booking } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { formatBdt, formatDate, formatDayLabel, formatTime } from '../../utils/format';
import { shareOrCopy } from '../../utils/share';
import { Badge } from '../common/Badge';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { servicesLabel } from './bookingHelpers';

interface ReceiptSheetProps {
  booking: Booking;
  open: boolean;
  onClose: () => void;
}

export function ReceiptSheet({ booking, open, onClose }: ReceiptSheetProps) {
  const toast = useAppStore((s) => s.toast);
  const t = useT();
  const services = servicesLabel(booking);

  const share = async () => {
    const lines = [
      t('bookings.receiptLineRef', { id: booking.id }),
      t('bookings.servicesAt', { services, pro: booking.professionalName }),
      t('bookings.receiptLineWhen', { day: formatDayLabel(booking.date), time: formatTime(booking.time) }),
      t('bookings.receiptLineTotal', {
        total: formatBdt(booking.total),
        method: t('booking.paymentAtSalon'),
      }),
    ];
    const result = await shareOrCopy({ title: t('bookings.receiptShareTitle'), text: lines.join('\n') });
    if (result === 'copied') toast('info', t('bookings.receiptCopied'), t('bookings.pasteAnywhere'));
    if (result === 'failed') toast('error', t('bookings.shareFailed'), t('bookings.tryAgainMoment'));
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('bookings.receiptTitle')}
      description={t('bookings.servicesAt', { services, pro: booking.professionalName })}
      footer={
        <Button variant="secondary" block icon={<Share2 size={18} aria-hidden="true" />} onClick={share}>
          {t('bookings.shareReceipt')}
        </Button>
      }
    >
      <div className="stack pf-receipt">
        <div className="bkl-receipt-head">
          <span className="stack-xs">
            <span className="label">{t('bookings.reference')}</span>
            <span className="mono">{booking.id}</span>
          </span>
          <Badge tone="success" plain pill>{t('bookings.paid')}</Badge>
        </div>

        <dl className="kv">
          {booking.services.map((service) => (
            <div key={service.id} className="kv-row">
              <dt>{service.name}</dt>
              <dd>{formatBdt(service.price)}</dd>
            </div>
          ))}
          <div className="kv-row">
            <dt>{t('bookings.subtotal')}</dt>
            <dd>{formatBdt(booking.subtotal)}</dd>
          </div>
          <div className="kv-row">
            <dt>{t('bookings.platformFee')}</dt>
            <dd>{formatBdt(booking.platformFee)}</dd>
          </div>
          <div className="kv-row kv-total">
            <dt>{t('bookings.total')}</dt>
            <dd>{formatBdt(booking.total)}</dd>
          </div>
        </dl>

        <dl className="kv">
          <div className="kv-row">
            <dt>{t('bookings.paidWith')}</dt>
            <dd>{t('booking.paymentAtSalon')}</dd>
          </div>
          <div className="kv-row">
            <dt>{t('bookings.datePaid')}</dt>
            <dd>{formatDate(booking.createdAt)}</dd>
          </div>
          <div className="kv-row">
            <dt>{t('bookings.stylist')}</dt>
            <dd>{booking.staffName}</dd>
          </div>
        </dl>
      </div>
    </BottomSheet>
  );
}
