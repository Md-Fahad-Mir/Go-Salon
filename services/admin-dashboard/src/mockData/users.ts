import type { SubscriptionTier, User, UserType } from '../types';
import {
  chance,
  emailFor,
  fullName,
  isoDaysAgo,
  makeLocation,
  phoneNumber,
  pick,
  randomFloat,
  randomInt,
} from './base';

const HAIR_TYPES = ['Straight', 'Wavy', 'Curly', 'Coily', 'Fine', 'Thick'];
const LENGTHS = ['Short', 'Medium', 'Shoulder', 'Long'];

const TYPE_MIX: UserType[] = [
  ...Array<UserType>(26).fill('customer'),
  ...Array<UserType>(8).fill('barber'),
  ...Array<UserType>(6).fill('salon'),
  ...Array<UserType>(7).fill('employee'),
  'admin',
  'admin',
];

const tierFor = (type: UserType): SubscriptionTier => {
  if (type === 'admin') return 'advanced';
  if (type === 'customer') return pick<SubscriptionTier>(['free', 'free', 'basic', 'advanced']);
  return pick<SubscriptionTier>(['basic', 'basic', 'advanced']);
};

export const mockUsers: User[] = TYPE_MIX.map((userType, index) => {
  const name = fullName();
  const tier = tierFor(userType);
  const isCustomer = userType === 'customer';
  return {
    id: `USR-${String(1041 + index).padStart(4, '0')}`,
    name,
    phone: phoneNumber(),
    email: chance(0.65) ? emailFor(name) : undefined,
    userType,
    subscriptionTier: tier,
    registrationDate: isoDaysAgo(randomInt(1, 420), randomInt(8, 21)),
    status: chance(0.86) ? 'active' : pick(['inactive', 'suspended']),
    totalBookings: isCustomer ? randomInt(0, 34) : randomInt(12, 260),
    averageRating: isCustomer ? undefined : randomFloat(3.8, 5, 1),
    location: makeLocation(),
    hairType: isCustomer ? pick(HAIR_TYPES) : undefined,
    preferredLength: isCustomer ? pick(LENGTHS) : undefined,
    phoneVerified: chance(0.9),
    generationsUsed: tier === 'advanced' ? randomInt(20, 480) : randomInt(0, 25),
  };
});

/* A couple of fixed records so the demo always has something to search for. */
mockUsers[0] = {
  ...mockUsers[0],
  id: 'USR-1041',
  name: 'Tanvir Ahmed',
  phone: '+8801711002233',
  email: 'tanvir.ahmed@gmail.com',
  userType: 'customer',
  subscriptionTier: 'advanced',
  status: 'active',
  totalBookings: 18,
  generationsUsed: 412,
};

mockUsers[1] = {
  ...mockUsers[1],
  id: 'USR-1042',
  name: 'Nusrat Jahan',
  phone: '+8801819445566',
  email: 'nusrat.jahan@gmail.com',
  userType: 'customer',
  subscriptionTier: 'basic',
  status: 'suspended',
  totalBookings: 4,
};
