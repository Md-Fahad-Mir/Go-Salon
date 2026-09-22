import type { Booking, BookingStatus } from '../types';
import { mockSalons, mockServices } from './salons';
import { mockUsers } from './users';
import { chance, isoDaysAgo, isoDaysAhead, pick, randomInt } from './base';

const PLATFORM_FEE = 5;
const TIMES = ['09:30', '10:00', '11:15', '12:00', '13:30', '15:00', '16:30', '17:45', '19:00'];
const NOTES = [
  'Please keep the sides short.',
  'Allergic to ammonia-based colour.',
  'Coming straight from office, may be 5 minutes late.',
  'Wants the same stylist as last visit.',
  '',
  '',
];

const customers = mockUsers.filter((user) => user.userType === 'customer');

const STATUS_MIX: BookingStatus[] = [
  ...Array<BookingStatus>(9).fill('pending'),
  ...Array<BookingStatus>(10).fill('approved'),
  ...Array<BookingStatus>(14).fill('completed'),
  ...Array<BookingStatus>(4).fill('cancelled'),
  ...Array<BookingStatus>(3).fill('rejected'),
  ...Array<BookingStatus>(2).fill('rescheduled'),
];

export const mockBookings: Booking[] = STATUS_MIX.map((status, index) => {
  const customer = pick(customers);
  const salon = pick(mockSalons);
  const service =
    mockServices.filter((s) => s.businessId === salon.id)[0] ?? mockServices[0];
  const upcoming = status === 'pending' || status === 'approved' || status === 'rescheduled';
  const amount = service.price;

  return {
    id: `BKG-${String(3001 + index)}`,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    businessId: salon.id,
    businessName: salon.name,
    staffName: chance(0.6) ? undefined : 'Assigned on arrival',
    serviceName: service.name,
    serviceDuration: service.duration,
    appointmentDate: upcoming
      ? isoDaysAhead(randomInt(0, 12), randomInt(9, 19))
      : isoDaysAgo(randomInt(1, 40), randomInt(9, 19)),
    appointmentTime: pick(TIMES),
    createdAt: isoDaysAgo(randomInt(1, 45), randomInt(8, 22)),
    status,
    acceptanceMode: salon.acceptanceMode,
    amount,
    platformFee: PLATFORM_FEE,
    totalAmount: amount + PLATFORM_FEE,
    notes: pick(NOTES) || undefined,
    reason:
      status === 'rejected'
        ? pick(['Stylist unavailable at that slot', 'Shop closed for a private event'])
        : status === 'cancelled'
          ? pick(['Customer cancelled outside the 2-hour window', 'Duplicate booking'])
          : undefined,
  };
});

mockBookings[0] = {
  ...mockBookings[0],
  id: 'BKG-3001',
  customerName: 'Tanvir Ahmed',
  customerPhone: '+8801711002233',
  businessName: 'Elegance Hair Studio',
  serviceName: 'Signature haircut',
  status: 'pending',
  acceptanceMode: 'manual',
};
