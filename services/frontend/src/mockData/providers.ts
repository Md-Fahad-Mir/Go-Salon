/* ==========================================================================
   Provider fixtures — the diary, the takings and the lookbook.

   Profiles, staff, services and working hours are **not** here any more: those
   four come from the backend, and a professional's own screens read the real
   thing. What is left is the work that has no backend yet — appointments,
   earnings, payout accounts, the lookbook and client hair histories — seeded
   from `hashUnit` so a screen renders the same on every reload.

   The seeds below are pinned to salons in `professionals.ts` so the sample
   diary describes a business the customer-facing listing also knows about.
   They are ids to hang sample rows off, never accounts and never profiles: an
   account created through the API matches none of them and correctly sees
   empty screens until bookings have a backend of their own.
   ========================================================================== */

import type {
  ClientHairProfile,
  EarningsDay,
  LookbookItem,
  PayoutAccount,
  ProviderAppointment,
  ProviderRole,
  TakingsMethod,
} from '../types';
import { hashUnit } from '../utils/id';
import { NOW, dateKeyFromToday, isoDaysAgo } from './base';
import { fixtureStaffFor, fixtureServicesFor } from './professionals';

/** One sample business: enough to seed a diary, and nothing that pretends to
    be somebody's profile. */
interface ProviderSeed {
  id: string;
  role: ProviderRole;
  businessName: string;
  /** The salon in `professionals.ts` this diary belongs to. */
  professionalId: string;
  /** For staff: which chair in that salon is theirs. */
  staffId?: string;
}

const PROVIDER_SEEDS: ProviderSeed[] = [
  { id: 'PRV-01', role: 'barber', businessName: "Rafiq's Chair", professionalId: 'PRO-203' },
  { id: 'PRV-02', role: 'salon_owner', businessName: 'Glow Beauty Lounge', professionalId: 'PRO-204' },
  { id: 'PRV-03', role: 'salon_employee', businessName: 'Persona Gents Salon', professionalId: 'PRO-201', staffId: 'STF-012' },
  { id: 'PRV-04', role: 'barber', businessName: 'Nadia Sultana — Bridal & Colour', professionalId: 'PRO-207', staffId: 'STF-071' },
];

const CUSTOMERS = [
  ['Tanvir Rahman', '+8801712000101'],
  ['Sabbir Khan', '+8801812000102'],
  ['Imran Hossain', '+8801912000103'],
  ['Nusrat Jahan', '+8801612000104'],
  ['Farhana Islam', '+8801712000105'],
  ['Mehedi Hasan', '+8801812000106'],
  ['Rumana Akter', '+8801912000107'],
  ['Arif Chowdhury', '+8801712000108'],
  ['Sadia Afrin', '+8801612000109'],
  ['Zubair Ahmed', '+8801812000110'],
  ['Priya Das', '+8801712000111'],
  ['Kamal Uddin', '+8801912000112'],
];

const METHODS: TakingsMethod[] = ['cash', 'bkash', 'nagad', 'cash', 'card', 'bkash'];

/** Builds one day of appointments for a provider, spread across opening hours.
    `dayOffset` 0 is today; negative days are already finished. */
const dayAppointments = (
  profile: ProviderSeed,
  dayOffset: number,
): ProviderAppointment[] => {
  const dateKey = dateKeyFromToday(dayOffset);
  // The sample diary prices itself off the salon's public menu rather than off
  // anybody's real price list — those live in the backend now.
  const services = fixtureServicesFor(profile.professionalId).map((service) => ({
    id: service.id,
    name: service.name,
    price: service.price,
    duration: service.duration,
  }));
  if (!services.length) return [];
  // Only a salon has chairs to spread work across. A solo barber or a stylist
  // working their own chair is the only person here, so their appointments
  // carry no staff assignment.
  const roster =
    profile.role === 'salon_owner'
      ? fixtureStaffFor(profile.professionalId)
      : [];
  const nowMinutes = NOW.getHours() * 60 + NOW.getMinutes();

  const count = 3 + Math.floor(hashUnit(`${profile.id}:count:${dateKey}`) * 4);
  const out: ProviderAppointment[] = [];

  for (let i = 0; i < count; i += 1) {
    const seed = hashUnit(`${profile.id}:${dateKey}:${i}`);
    const service = services[Math.floor(seed * services.length)];
    const second = seed > 0.78 ? services[(Math.floor(seed * services.length) + 1) % services.length] : undefined;
    const picked = second && second.id !== service.id ? [service, second] : [service];

    const startMinutes = 10 * 60 + i * 75 + Math.round(seed * 20);
    const time = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
    const duration = picked.reduce((sum, s) => sum + s.duration, 0);
    const total = picked.reduce((sum, s) => sum + s.price, 0);
    // The id has to identify the *person*, not the slot: deriving it from the
    // loop index let one id carry different names across appointments, so a
    // hair profile could attach to the wrong client.
    const customerIndex = (i + Math.floor(seed * 7)) % CUSTOMERS.length;
    const [customerName, customerPhone] = CUSTOMERS[customerIndex];
    const member = roster.length ? roster[i % roster.length] : undefined;

    // Today's list is a live queue: past slots are done, the current one is in
    // the chair, and the rest are still to come.
    let stage: ProviderAppointment['stage'];
    if (dayOffset < 0) {
      stage = seed > 0.9 ? 'no_show' : seed > 0.86 ? 'cancelled' : 'completed';
    } else if (dayOffset > 0) {
      stage = 'upcoming';
    } else if (startMinutes + duration < nowMinutes) {
      stage = seed > 0.93 ? 'no_show' : 'completed';
    } else if (startMinutes <= nowMinutes) {
      stage = 'in_chair';
    } else {
      stage = 'upcoming';
    }

    const settled = stage === 'completed';
    out.push({
      id: `APT-${profile.id.slice(-2)}-${dateKey.replace(/-/g, '')}-${i + 1}`,
      providerId: profile.id,
      staffId: member?.id,
      staffName: member?.name,
      customerId: `CUS-${String(customerIndex + 1).padStart(2, '0')}`,
      customerName,
      customerPhone,
      isNewCustomer: seed > 0.72,
      services: picked.map((s) => ({ id: s.id, name: s.name, price: s.price, duration: s.duration })),
      date: dateKey,
      time,
      duration,
      // The sample menu carries no platform fee, so the two are the same here.
      subtotal: total,
      total,
      stage,
      startedAt: stage === 'in_chair' || settled ? `${dateKey}T${time}:00` : undefined,
      completedAt: settled ? `${dateKey}T${time}:00` : undefined,
      paidWith: settled ? METHODS[i % METHODS.length] : undefined,
      tip: settled && seed > 0.7 ? Math.round((seed * 120) / 10) * 10 : undefined,
      walkIn: seed > 0.85,
      notes: seed > 0.8 ? 'Asked to keep the length on top.' : undefined,
      createdAt: isoDaysAgo(Math.max(0, -dayOffset) + 2, 12),
    });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
};

/** Two weeks of sample work, kept **private to this file**.

    Bookings have a backend, and the diary screens read it — nothing outside
    this module may hand a screen an appointment that nobody made. What is
    left of this is the takings chart below, which has no backend yet and
    needs completed work to add up. */
const mockProviderAppointments: ProviderAppointment[] = PROVIDER_SEEDS.flatMap((profile) =>
  Array.from({ length: 22 }, (_, i) => i - 14).flatMap((offset) => dayAppointments(profile, offset)),
);

/* --- Money ----------------------------------------------------------------- */

const EMPTY_TAKINGS: Record<TakingsMethod, number> = {
  cash: 0, bkash: 0, nagad: 0, rocket: 0, card: 0,
};

/** Rolls the completed appointments of each day into a takings row. */
export const earningsFor = (providerId: string, days = 14): EarningsDay[] =>
  Array.from({ length: days }, (_, i) => {
    const dateKey = dateKeyFromToday(-(days - 1 - i));
    const done = mockProviderAppointments.filter(
      (a) => a.providerId === providerId && a.date === dateKey && a.stage === 'completed',
    );
    const takings = { ...EMPTY_TAKINGS };
    let tips = 0;
    for (const appointment of done) {
      takings[appointment.paidWith ?? 'cash'] += appointment.total;
      tips += appointment.tip ?? 0;
    }
    const gross = Object.values(takings).reduce((sum, value) => sum + value, 0);
    return {
      date: dateKey,
      appointments: done.length,
      takings,
      tips,
      net: Math.round(gross * 0.9) + tips,
    } satisfies EarningsDay;
  });

export const mockPayoutAccounts: PayoutAccount[] = [
  { id: 'PAY-01', providerId: 'PRV-01', method: 'bkash', number: '01711•••111', holderName: 'Rafiqul Karim', isDefault: true, verified: true },
  { id: 'PAY-02', providerId: 'PRV-02', method: 'bank', number: '••••4417', holderName: 'Glow Beauty Lounge', bankName: 'BRAC Bank', isDefault: true, verified: true },
  { id: 'PAY-03', providerId: 'PRV-04', method: 'nagad', number: '01744•••444', holderName: 'Nadia Sultana', isDefault: true, verified: false },
];

/** A salaried employee is paid by their salon rather than by the platform, so
    they correctly have no payout account of their own. */
export const payoutAccountsFor = (providerId: string): PayoutAccount[] =>
  mockPayoutAccounts.filter((account) => account.providerId === providerId);

/* --- Women's salon extras --------------------------------------------------- */

export const mockClientProfiles: ClientHairProfile[] = [
  {
    customerId: 'CUS-04',
    customerName: 'Nusrat Jahan',
    hairType: 'wavy',
    hairLength: 'long',
    notes: 'Prefers warm tones. Sensitive scalp — use the gentler developer.',
    history: ['Balayage, 3 months ago', 'Keratin smoothing, 8 months ago', 'No bleach above the ear'],
    inspirationTones: [5, 3, 2],
    privateContact: true,
    lastVisit: isoDaysAgo(92, 15),
    visitCount: 6,
  },
  {
    customerId: 'CUS-05',
    customerName: 'Farhana Islam',
    hairType: 'straight',
    hairLength: 'medium',
    notes: 'Holud in November — building the colour up in two sittings.',
    history: ['Global colour, 5 weeks ago', 'Trim and layers, 5 weeks ago'],
    inspirationTones: [4, 5],
    privateContact: false,
    lastVisit: isoDaysAgo(35, 11),
    visitCount: 3,
  },
  {
    customerId: 'CUS-07',
    customerName: 'Rumana Akter',
    hairType: 'curly',
    hairLength: 'medium',
    notes: 'Curl pattern loosens at the crown. Cut dry.',
    history: ['Curly shag, 7 weeks ago', 'Deep conditioning, 7 weeks ago'],
    inspirationTones: [3, 1],
    privateContact: true,
    lastVisit: isoDaysAgo(49, 16),
    visitCount: 4,
  },
  {
    customerId: 'CUS-09',
    customerName: 'Sadia Afrin',
    hairType: 'coily',
    hairLength: 'short',
    history: ['First visit'],
    inspirationTones: [2],
    privateContact: false,
    visitCount: 1,
  },
];

export const getClientProfile = (customerId: string): ClientHairProfile | undefined =>
  mockClientProfiles.find((profile) => profile.customerId === customerId);

const LOOKBOOK_SEEDS: Array<[string, string, number]> = [
  ['Bridal', 'Holud updo with fresh marigold', 5],
  ['Bridal', 'Soft bridal waves, low bun', 3],
  ['Bridal', 'Reception half-up with braid detail', 4],
  ['Layers', 'Long layers with a curtain fringe', 2],
  ['Layers', 'Curly shag, cut dry', 1],
  ['Colouring', 'Caramel balayage on natural black', 5],
  ['Colouring', 'Ash ribbons, two sittings', 0],
  ['Colouring', 'Warm honey global colour', 4],
  ['Hair care', 'Keratin smoothing, six-month hold', 2],
  ['Hair care', 'Scalp spa and deep conditioning', 3],
];

export const mockLookbook: LookbookItem[] = LOOKBOOK_SEEDS.map(([category, caption, tone], index) => ({
  id: `LKB-${String(index + 1).padStart(2, '0')}`,
  providerId: 'PRV-04',
  category,
  caption,
  tone,
  createdAt: isoDaysAgo(index * 9 + 3, 14),
  published: index % 7 !== 3,
}));

export const lookbookFor = (providerId: string): LookbookItem[] =>
  mockLookbook.filter((item) => item.providerId === providerId);
