import type { AiGenerationCharge, PaymentMethod, Transaction, TransactionStatus } from '../types';
import { mockBookings } from './bookings';
import { mockHairstyles } from './hairstyles';
import { mockUsers } from './users';
import { isoDaysAgo, isoHoursAgo, pick, randomFloat, randomInt } from './base';

const METHOD_MIX: PaymentMethod[] = [
  ...Array<PaymentMethod>(18).fill('bkash'),
  ...Array<PaymentMethod>(9).fill('nagad'),
  ...Array<PaymentMethod>(4).fill('rocket'),
  ...Array<PaymentMethod>(6).fill('card'),
];

const statusFor = (index: number): TransactionStatus => {
  if (index % 13 === 5) return 'failed';
  if (index % 17 === 7) return 'refunded';
  if (index % 11 === 3) return 'pending';
  return 'completed';
};

export const mockTransactions: Transaction[] = mockBookings
  .slice(0, 37)
  .map((booking, index) => {
    const method = METHOD_MIX[index % METHOD_MIX.length];
    return {
      id: `TRX-${String(7001 + index)}`,
      bookingId: booking.id,
      customerName: booking.customerName,
      businessName: booking.businessName,
      amount: booking.amount,
      platformFee: booking.platformFee,
      totalAmount: booking.totalAmount,
      paymentMethod: method,
      status: statusFor(index),
      date: isoDaysAgo(randomInt(0, 30), randomInt(9, 21)),
      reference: `${method.toUpperCase().slice(0, 3)}${randomInt(100000, 999999)}`,
    };
  });

const advancedUsers = mockUsers.filter((user) => user.subscriptionTier === 'advanced');

export const mockAiCharges: AiGenerationCharge[] = Array.from({ length: 24 }, (_, index) => {
  const user = pick(advancedUsers);
  const style = pick(mockHairstyles);
  const images = randomInt(1, 4);
  const outcome = index % 9 === 4 ? 'failed' : 'success';
  return {
    id: `AIG-${String(9001 + index)}`,
    userId: user.id,
    userName: user.name,
    hairstyleName: style.name,
    images,
    charge: outcome === 'success' ? images * 15 : 0,
    cost: Number((images * 0.042).toFixed(3)),
    outcome,
    latencySeconds: randomFloat(9.4, 31.2, 1),
    date: isoHoursAgo(randomInt(1, 96)),
  };
});
