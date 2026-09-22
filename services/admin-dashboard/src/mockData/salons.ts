import type { Salon, Service, StaffMember, TargetAudience } from '../types';
import {
  chance,
  emailFor,
  fullName,
  isoDaysAgo,
  makeHours,
  makeLocation,
  phoneNumber,
  pick,
  pickMany,
  randomFloat,
  randomInt,
} from './base';

const BUSINESS_NAMES = [
  'Elegance Hair Studio', "Rafiq's Chair", 'Glow Beauty Lounge', 'Persona Barber Salon',
  'Momova Beauty Parlour', 'Style Deck', 'Bindiya Salon', 'Sharp Cuts BD',
  'Bloom Bridal Studio', 'Trim & Fade', 'The Grooming Room', "Habib's Hair Care",
  'Nabila Beauty Care', 'Urban Barber Co', 'Mirror Image Salon', 'Aura Hair Lab',
  "Gentlemen's Den", "Lily's Beauty Bar",
] as const;

const ROLE_TITLES = ['Senior stylist', 'Master barber', 'Colour specialist', 'Bridal artist', 'Junior stylist'];
const SPECIALTIES = ['Fades', 'Colouring', 'Bridal', 'Beard work', 'Keratin', 'Braiding', 'Kids cuts', 'Blow-dry'];

const SERVICE_SEEDS: Array<{ name: string; category: string; duration: number; price: number; audience: TargetAudience }> = [
  { name: 'Signature haircut', category: 'Haircut', duration: 30, price: 450, audience: 'all' },
  { name: 'Skin fade', category: 'Haircut', duration: 40, price: 550, audience: 'male' },
  { name: 'Beard trim & shape', category: 'Beard', duration: 20, price: 300, audience: 'male' },
  { name: 'Layer cut', category: 'Haircut', duration: 45, price: 800, audience: 'female' },
  { name: 'Global colour', category: 'Coloring', duration: 90, price: 3200, audience: 'all' },
  { name: 'Keratin treatment', category: 'Treatment', duration: 120, price: 6500, audience: 'female' },
  { name: 'Bridal package', category: 'Bridal', duration: 180, price: 12000, audience: 'female' },
  { name: 'Kids cut', category: 'Haircut', duration: 20, price: 250, audience: 'all' },
  { name: 'Hair spa', category: 'Treatment', duration: 60, price: 1500, audience: 'all' },
];

export const mockSalons: Salon[] = BUSINESS_NAMES.map((name, index) => {
  const businessType: Salon['businessType'] = /barber|chair|fade|grooming|den|cuts/i.test(name)
    ? 'barber'
    : 'salon';
  const owner = fullName();
  const verificationStatus: Salon['verificationStatus'] =
    index < 11 ? 'verified' : index < 16 ? 'pending' : 'rejected';
  // Anything still in the approval queue signed up in the last fortnight.
  const daysSinceJoin =
    verificationStatus === 'verified'
      ? randomInt(60, 500)
      : verificationStatus === 'pending'
        ? randomInt(1, 14)
        : randomInt(15, 60);
  return {
    id: `BIZ-${String(201 + index)}`,
    name,
    businessType,
    ownerName: owner,
    phone: phoneNumber(),
    email: chance(0.7) ? emailFor(name) : undefined,
    location: makeLocation(),
    bio: `${name} is a ${businessType === 'barber' ? 'neighbourhood barbershop' : 'full-service salon'} in Dhaka offering cuts, colour and grooming with online booking through Eureka.`,
    verificationStatus,
    activeStaffCount: 0,
    totalServices: 0,
    rating: randomFloat(3.6, 5, 1),
    reviewCount: randomInt(14, 480),
    status: chance(0.9) ? 'active' : 'inactive',
    operatingHours: makeHours(businessType === 'barber'),
    joinedDate: isoDaysAgo(daysSinceJoin),
    acceptanceMode: chance(0.55) ? 'auto' : 'manual',
    monthlyRevenue: randomInt(48000, 690000),
  };
});

export const mockStaff: StaffMember[] = mockSalons.flatMap((salon, salonIndex) =>
  Array.from({ length: randomInt(2, 6) }, (_, i) => ({
    id: `STF-${String(salonIndex + 1).padStart(2, '0')}${i + 1}`,
    salonId: salon.id,
    name: fullName(),
    phone: phoneNumber(),
    roleTitle: pick(ROLE_TITLES),
    specialties: pickMany(SPECIALTIES, randomInt(1, 3)),
    experienceYears: pick(['0–2 yrs', '2–5 yrs', '5–10 yrs', '10+ yrs']),
    customHours: chance(0.3),
    status: chance(0.88) ? 'active' : 'inactive',
    rating: randomFloat(3.7, 5, 1),
    bio: 'Works the chair six days a week and takes walk-ins between booked slots.',
  })),
);

export const mockServices: Service[] = mockSalons.flatMap((salon, salonIndex) => {
  const staffIds = mockStaff.filter((s) => s.salonId === salon.id).map((s) => s.id);
  return pickMany(SERVICE_SEEDS, randomInt(3, 6)).map((seed, i) => {
    const eligibility: Service['eligibility'] = chance(0.7) ? 'all' : 'specific';
    return {
      id: `SVC-${String(salonIndex + 1).padStart(2, '0')}${i + 1}`,
      businessId: salon.id,
      name: seed.name,
      category: seed.category,
      price: seed.price + randomInt(-50, 200),
      duration: seed.duration,
      targetAudience: seed.audience,
      eligibility,
      eligibleStaffIds: eligibility === 'specific' ? pickMany(staffIds, Math.max(1, staffIds.length - 1)) : [],
      description: `${seed.name} at ${salon.name}.`,
      status: chance(0.93) ? 'active' : 'inactive',
    };
  });
});

/* Backfill the counters the table columns read. */
for (const salon of mockSalons) {
  salon.activeStaffCount = mockStaff.filter((s) => s.salonId === salon.id && s.status === 'active').length;
  salon.totalServices = mockServices.filter((s) => s.businessId === salon.id).length;
}
