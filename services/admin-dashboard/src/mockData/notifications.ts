import type { AppNotification, NotificationStatus, SmsTemplate } from '../types';
import { NOTIFICATION_TYPES } from '../constants';
import { mockBookings } from './bookings';
import { chance, isoDaysAgo, isoHoursAgo, pick, randomInt } from './base';

const bodyFor = (type: string, business: string, date: string): string => {
  switch (type) {
    case 'Booking approved':
      return `Eureka: your booking at ${business} is confirmed for ${date}. Reply STOP to opt out.`;
    case 'Booking declined':
      return `Eureka: ${business} could not take your ${date} slot. Your payment has been released.`;
    case 'Booking reminder':
      return `Eureka: reminder — ${business} tomorrow at ${date}. Cancel free up to 2 hours before.`;
    case 'Payment receipt':
      return `Eureka: payment received. Booking at ${business} on ${date}. Receipt in the app.`;
    case 'Payment reminder':
      return `Eureka: your booking at ${business} is unpaid. Complete payment to keep the ${date} slot.`;
    case 'OTP verification':
      return `Eureka: your verification code is ${randomInt(100000, 999999)}. It expires in 15 minutes.`;
    default:
      return `Eureka: your Advanced subscription renews on ${date}. Manage it in the app.`;
  }
};

export const mockNotifications: AppNotification[] = Array.from({ length: 34 }, (_, index) => {
  const booking = mockBookings[index % mockBookings.length];
  const type = pick(NOTIFICATION_TYPES);
  const status: NotificationStatus =
    index % 12 === 4 ? 'failed' : index % 15 === 9 ? 'bounced' : index % 7 === 2 ? 'scheduled' : 'sent';
  const sentAt = isoHoursAgo(randomInt(1, 120));

  return {
    id: `NTF-${String(6001 + index)}`,
    recipientName: booking.customerName,
    recipientPhone: booking.customerPhone,
    type,
    content: bodyFor(type, booking.businessName, `${booking.appointmentTime}`),
    scheduledTime: status === 'scheduled' ? isoDaysAgo(-randomInt(0, 3), randomInt(8, 20)) : undefined,
    sentTime: status === 'scheduled' ? undefined : sentAt,
    status,
    deliveryStatus: status === 'sent' ? 'delivered' : status === 'scheduled' ? 'pending' : 'failed',
    channel: chance(0.8) ? 'sms' : 'push',
    attempts:
      status === 'scheduled'
        ? [{ at: sentAt, result: 'queued', detail: 'Queued with the SMS gateway' }]
        : status === 'sent'
          ? [{ at: sentAt, result: 'delivered', detail: 'Delivered · gateway ack in 1.2s' }]
          : [
              { at: sentAt, result: 'failed', detail: 'Gateway returned 421 — handset unreachable' },
              { at: sentAt, result: 'failed', detail: 'Retry 1 of 2 failed after 30s' },
            ],
  };
});

export const mockTemplates: SmsTemplate[] = [
  {
    id: 'TPL-01',
    name: 'Booking approved',
    type: 'Booking approved',
    body: 'Eureka: your booking at {businessName} is confirmed for {date} at {time}. Reply STOP to opt out.',
  },
  {
    id: 'TPL-02',
    name: 'Booking declined',
    type: 'Booking declined',
    body: 'Eureka: {businessName} could not take your {date} slot. Your payment has been released.',
  },
  {
    id: 'TPL-03',
    name: 'Appointment reminder',
    type: 'Booking reminder',
    body: 'Eureka: reminder — {businessName} on {date} at {time}. Free cancellation up to {window} hours before.',
  },
  {
    id: 'TPL-04',
    name: 'OTP verification',
    type: 'OTP verification',
    body: 'Eureka: your verification code is {code}. It expires in {expiry} minutes.',
  },
];
