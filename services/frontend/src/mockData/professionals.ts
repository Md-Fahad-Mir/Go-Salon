/* Sample businesses for the screens that still have no backend.

   This used to be the customer catalogue — the salons Search showed. It is
   not any more: salons and barbers come from `/api/directory/`, and a
   customer never reads a line of this file. What survives is the menu and the
   chairs the provider-side diary in `providers.ts` is seeded from, plus the
   ids the sample reviews hang off.
*/

import type { Service, StaffMember } from '../types';

/* --- Service templates ------------------------------------------------------ */

interface ServiceSeed {
  key: string;
  name: string;
  category: string;
  duration: number;
  price: number;
  description: string;
  includes: string[];
  suitableFor: Service['suitableFor'];
  hairstyleIds: string[];
  popular?: boolean;
}

const BARBER: Record<string, ServiceSeed> = {
  crop: { key: 'crop', name: 'Textured crop', category: 'Haircut', duration: 30, price: 650, description: 'Scissor-and-clipper crop with a textured, forward-styled top.', includes: ['Consultation', 'Wash', 'Cut', 'Style'], suitableFor: 'men', hairstyleIds: ['HS-101', 'HS-117'], popular: true },
  fade: { key: 'fade', name: 'Skin fade', category: 'Haircut', duration: 40, price: 550, description: 'Blended fade down to the skin, finished with a straight razor line-up.', includes: ['Fade', 'Line-up', 'Style'], suitableFor: 'men', hairstyleIds: ['HS-102', 'HS-117'], popular: true },
  beard: { key: 'beard', name: 'Beard trim & shape', category: 'Beard', duration: 20, price: 300, description: 'Clippers and scissors to shape, with a hot towel and beard oil to finish.', includes: ['Hot towel', 'Shape', 'Oil'], suitableFor: 'men', hairstyleIds: ['HS-104'] },
  shave: { key: 'shave', name: 'Hot towel shave', category: 'Beard', duration: 25, price: 400, description: 'Traditional straight-razor shave with two hot towels and aftershave balm.', includes: ['Hot towel', 'Razor shave', 'Balm'], suitableFor: 'men', hairstyleIds: [] },
  buzz: { key: 'buzz', name: 'Buzz cut', category: 'Haircut', duration: 15, price: 350, description: 'One clipper length all over with a clean line-up.', includes: ['Clipper cut', 'Line-up'], suitableFor: 'men', hairstyleIds: ['HS-108'] },
  classic: { key: 'classic', name: 'Classic cut & style', category: 'Haircut', duration: 35, price: 700, description: 'Longer scissor cut for pompadours, slick-backs and side parts, blow-dried and styled.', includes: ['Wash', 'Scissor cut', 'Blow-dry', 'Product'], suitableFor: 'men', hairstyleIds: ['HS-109', 'HS-112'] },
  kids: { key: 'kids', name: 'Kids cut', category: 'Haircut', duration: 20, price: 300, description: 'Quick, patient cut for under-12s.', includes: ['Cut', 'Style'], suitableFor: 'all', hairstyleIds: [] },
  wash: { key: 'wash', name: 'Wash & style', category: 'Styling', duration: 20, price: 350, description: 'Shampoo, condition and a styled blow-dry.', includes: ['Wash', 'Blow-dry'], suitableFor: 'all', hairstyleIds: [] },
};

const SALON: Record<string, ServiceSeed> = {
  signature: { key: 'signature', name: 'Signature haircut', category: 'Haircut', duration: 45, price: 900, description: 'Consultation, wash, precision cut and a finished blow-dry.', includes: ['Consultation', 'Wash', 'Cut', 'Blow-dry'], suitableFor: 'all', hairstyleIds: ['HS-103', 'HS-110', 'HS-113', 'HS-118'], popular: true },
  layer: { key: 'layer', name: 'Layer cut', category: 'Haircut', duration: 45, price: 1200, description: 'Graduated layers cut to your face shape and hair texture.', includes: ['Consultation', 'Wash', 'Cut', 'Blow-dry'], suitableFor: 'women', hairstyleIds: ['HS-103', 'HS-113', 'HS-118'], popular: true },
  bob: { key: 'bob', name: 'Blunt bob', category: 'Haircut', duration: 40, price: 1100, description: 'A single sharp line at jaw or chin length, finished sleek.', includes: ['Wash', 'Cut', 'Flat-iron finish'], suitableFor: 'women', hairstyleIds: ['HS-110'] },
  fringe: { key: 'fringe', name: 'Fringe & face frame', category: 'Styling', duration: 25, price: 600, description: 'Curtain or blunt fringe with soft face-framing pieces.', includes: ['Dry cut', 'Style'], suitableFor: 'all', hairstyleIds: ['HS-106'] },
  blowdry: { key: 'blowdry', name: 'Blow-dry & soft waves', category: 'Styling', duration: 40, price: 800, description: 'Round-brush blow-dry with loose, brushed-out waves.', includes: ['Wash', 'Blow-dry', 'Waves'], suitableFor: 'women', hairstyleIds: ['HS-114'] },
  colour: { key: 'colour', name: 'Global colour', category: 'Coloring', duration: 90, price: 3500, description: 'Single-process colour root to tip, with a gloss to seal.', includes: ['Patch test', 'Colour', 'Gloss', 'Blow-dry'], suitableFor: 'all', hairstyleIds: ['HS-115'] },
  balayage: { key: 'balayage', name: 'Balayage', category: 'Coloring', duration: 150, price: 6500, description: 'Hand-painted highlights with a toner and bond-repair treatment.', includes: ['Consultation', 'Lightening', 'Toner', 'Treatment', 'Blow-dry'], suitableFor: 'women', hairstyleIds: ['HS-107'] },
  keratin: { key: 'keratin', name: 'Keratin smoothing', category: 'Treatment', duration: 120, price: 7000, description: 'Frizz-taming smoothing treatment that lasts up to three months.', includes: ['Clarifying wash', 'Treatment', 'Flat-iron seal'], suitableFor: 'women', hairstyleIds: ['HS-116'] },
  spa: { key: 'spa', name: 'Hair spa', category: 'Treatment', duration: 60, price: 1500, description: 'Deep-conditioning mask with a scalp massage and steam.', includes: ['Wash', 'Mask', 'Steam', 'Massage', 'Blow-dry'], suitableFor: 'all', hairstyleIds: [] },
  bridal: { key: 'bridal', name: 'Bridal / holud updo', category: 'Bridal', duration: 90, price: 4500, description: 'Event updo built for flowers and a full night. Trial available.', includes: ['Consultation', 'Prep', 'Updo', 'Setting'], suitableFor: 'women', hairstyleIds: ['HS-105'] },
  braids: { key: 'braids', name: 'Box braids', category: 'Braiding', duration: 180, price: 5500, description: 'Medium box braids with extensions, mid-back length.', includes: ['Wash', 'Sectioning', 'Braiding', 'Sealing'], suitableFor: 'women', hairstyleIds: ['HS-111'] },
  mens: { key: 'mens', name: "Men's cut & style", category: 'Haircut', duration: 35, price: 750, description: 'Scissor or clipper cut, washed and styled.', includes: ['Wash', 'Cut', 'Style'], suitableFor: 'men', hairstyleIds: ['HS-101', 'HS-102', 'HS-112'] },
};

/* --- Professionals ---------------------------------------------------------- */

/** One sample business. Only its id is used now: the fake salon profile that
    used to sit here was the customer catalogue, and the customer catalogue is
    the backend's. What is left seeds the provider diary. */
interface ProSeed {
  id: string;
  staff: Array<Omit<StaffMember, 'id' | 'professionalId'>>;
  services: Array<{ seed: ServiceSeed; price?: number }>;
}

const SEEDS: ProSeed[] = [
  {
    id: 'PRO-201',
    staff: [
      { name: 'Rafiq Islam', title: 'Master barber', rating: 4.9, reviewCount: 128, specialties: ['Fades', 'Crops', 'Beard work'], experienceYears: 11, tone: 0, daysOff: ['tue'] },
      { name: 'Hasan Mahmud', title: 'Senior barber', rating: 4.7, reviewCount: 64, specialties: ['Classic cuts', 'Shaves'], experienceYears: 6, tone: 1, daysOff: ['mon'] },
      { name: 'Tanvir Ahmed', title: 'Barber', rating: 4.6, reviewCount: 22, specialties: ['Fades', 'Kids cuts'], experienceYears: 3, tone: 2, daysOff: ['wed'] },
    ],
    services: [
      { seed: BARBER.crop }, { seed: BARBER.fade }, { seed: BARBER.beard }, { seed: BARBER.shave },
      { seed: BARBER.classic }, { seed: BARBER.buzz }, { seed: BARBER.kids }, { seed: BARBER.wash },
    ],
  },
  {
    id: 'PRO-202',
    staff: [
      { name: 'Nusrat Jahan', title: 'Senior stylist', rating: 4.8, reviewCount: 96, specialties: ['Layer cuts', 'Bobs', 'Fringes'], experienceYears: 9, tone: 3, daysOff: ['fri'] },
      { name: 'Sadia Islam', title: 'Colour specialist', rating: 4.9, reviewCount: 71, specialties: ['Balayage', 'Global colour'], experienceYears: 8, tone: 4, daysOff: ['fri', 'mon'] },
      { name: 'Farhana Akter', title: 'Stylist', rating: 4.6, reviewCount: 30, specialties: ['Blow-dry', 'Treatments'], experienceYears: 4, tone: 5, daysOff: ['fri'] },
    ],
    services: [
      { seed: SALON.signature }, { seed: SALON.layer }, { seed: SALON.bob }, { seed: SALON.fringe },
      { seed: SALON.blowdry }, { seed: SALON.colour }, { seed: SALON.balayage }, { seed: SALON.keratin }, { seed: SALON.spa },
    ],
  },
  {
    id: 'PRO-203',
    staff: [
      { name: 'Rafiqul Karim', title: 'Owner & barber', rating: 4.9, reviewCount: 87, specialties: ['Scissor cuts', 'Beard sculpt', 'Fades'], experienceYears: 15, tone: 5, daysOff: ['sun'] },
    ],
    services: [
      { seed: BARBER.crop, price: 600 }, { seed: BARBER.fade, price: 600 }, { seed: BARBER.beard, price: 350 },
      { seed: BARBER.classic, price: 750 }, { seed: BARBER.buzz },
    ],
  },
  {
    id: 'PRO-204',
    staff: [
      { name: 'Rumana Haque', title: 'Bridal artist', rating: 4.9, reviewCount: 140, specialties: ['Bridal updos', 'Holud styling'], experienceYears: 12, tone: 4, daysOff: ['mon'] },
      { name: 'Tasnim Noor', title: 'Colour specialist', rating: 4.8, reviewCount: 88, specialties: ['Balayage', 'Ash tones'], experienceYears: 7, tone: 3, daysOff: ['tue'] },
      { name: 'Anika Rahman', title: 'Senior stylist', rating: 4.7, reviewCount: 52, specialties: ['Layer cuts', 'Blow-dry', 'Braids'], experienceYears: 6, tone: 5, daysOff: ['wed'] },
      { name: 'Maliha Chowdhury', title: 'Treatment specialist', rating: 4.8, reviewCount: 32, specialties: ['Keratin', 'Hair spa'], experienceYears: 5, tone: 2, daysOff: ['thu'] },
    ],
    services: [
      { seed: SALON.signature, price: 1200 }, { seed: SALON.layer, price: 1500 }, { seed: SALON.blowdry, price: 1000 },
      { seed: SALON.colour, price: 4200 }, { seed: SALON.balayage, price: 8500 }, { seed: SALON.keratin, price: 9000 },
      { seed: SALON.spa, price: 1800 }, { seed: SALON.bridal, price: 6500 }, { seed: SALON.braids, price: 6000 },
    ],
  },
  {
    id: 'PRO-205',
    staff: [
      { name: 'Sabbir Rahman', title: 'Senior barber', rating: 4.7, reviewCount: 160, specialties: ['Skin fades', 'Designs'], experienceYears: 8, tone: 1, daysOff: ['sun'] },
      { name: 'Mehedi Hasan', title: 'Barber', rating: 4.6, reviewCount: 98, specialties: ['Fades', 'Beard work'], experienceYears: 5, tone: 2, daysOff: ['mon'] },
      { name: 'Jubayer Khan', title: 'Barber', rating: 4.5, reviewCount: 74, specialties: ['Crops', 'Kids cuts'], experienceYears: 4, tone: 0, daysOff: ['tue'] },
      { name: 'Sohel Rana', title: 'Junior barber', rating: 4.4, reviewCount: 25, specialties: ['Buzz cuts', 'Wash & style'], experienceYears: 2, tone: 5, daysOff: ['wed'] },
    ],
    services: [
      { seed: BARBER.fade, price: 500 }, { seed: BARBER.crop, price: 600 }, { seed: BARBER.beard, price: 250 },
      { seed: BARBER.buzz, price: 300 }, { seed: BARBER.shave, price: 350 }, { seed: BARBER.kids, price: 250 }, { seed: BARBER.wash, price: 300 },
    ],
  },
  {
    id: 'PRO-206',
    staff: [
      { name: 'Imran Chowdhury', title: 'Master barber', rating: 4.9, reviewCount: 102, specialties: ['Beard sculpt', 'Classic cuts', 'Shaves'], experienceYears: 13, tone: 3, daysOff: ['mon'] },
      { name: 'Shakib Al Amin', title: 'Senior barber', rating: 4.7, reviewCount: 54, specialties: ['Fades', 'Crops'], experienceYears: 7, tone: 2, daysOff: ['tue'] },
    ],
    services: [
      { seed: BARBER.classic, price: 1100 }, { seed: BARBER.crop, price: 950 }, { seed: BARBER.fade, price: 900 },
      { seed: BARBER.beard, price: 500 }, { seed: BARBER.shave, price: 650 }, { seed: BARBER.wash, price: 450 },
    ],
  },
  {
    id: 'PRO-207',
    staff: [
      { name: 'Nadia Sultana', title: 'Owner & stylist', rating: 4.6, reviewCount: 150, specialties: ['Bridal', 'Layer cuts', 'Braids'], experienceYears: 20, tone: 4, daysOff: ['fri'] },
      { name: 'Israt Jahan', title: 'Stylist', rating: 4.5, reviewCount: 61, specialties: ['Treatments', 'Blow-dry'], experienceYears: 5, tone: 0, daysOff: ['fri', 'sat'] },
    ],
    services: [
      { seed: SALON.signature, price: 700 }, { seed: SALON.layer, price: 900 }, { seed: SALON.spa, price: 1200 },
      { seed: SALON.keratin, price: 5500 }, { seed: SALON.bridal, price: 3800 }, { seed: SALON.braids, price: 4500 }, { seed: SALON.colour, price: 2800 },
    ],
  },
  {
    id: 'PRO-208',
    staff: [
      { name: 'Arif Hossain', title: 'Senior barber', rating: 4.7, reviewCount: 110, specialties: ['Crops', 'Wolf cuts', 'Colour'], experienceYears: 7, tone: 2, daysOff: ['sun'] },
      { name: 'Naimur Rahman', title: 'Barber', rating: 4.5, reviewCount: 58, specialties: ['Fades', 'Buzz cuts'], experienceYears: 3, tone: 4, daysOff: ['mon'] },
      { name: 'Fahim Ahmed', title: 'Barber', rating: 4.6, reviewCount: 21, specialties: ['Crops', 'Beard work'], experienceYears: 2, tone: 0, daysOff: ['tue'] },
    ],
    services: [
      { seed: BARBER.crop, price: 550 }, { seed: BARBER.fade, price: 500 }, { seed: BARBER.buzz, price: 350 },
      { seed: BARBER.beard, price: 300 }, { seed: BARBER.classic, price: 650 },
      { seed: { ...SALON.colour, key: 'mens-colour', name: "Men's colour", duration: 60, description: 'Single-process colour or grey blending for men.', includes: ['Patch test', 'Colour', 'Wash'], suitableFor: 'men', hairstyleIds: ['HS-115'] }, price: 1800 },
    ],
  },
];

export const mockStaff: StaffMember[] = SEEDS.flatMap((seed, proIndex) =>
  seed.staff.map((member, i) => ({
    ...member,
    id: `STF-${String(proIndex + 1).padStart(2, '0')}${i + 1}`,
    professionalId: seed.id,
  })),
);

export const mockServices: Service[] = SEEDS.flatMap((seed, proIndex) =>
  seed.services.map(({ seed: service, price }, i) => ({
    id: `SVC-${String(proIndex + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
    professionalId: seed.id,
    name: service.name,
    category: service.category,
    duration: service.duration,
    price: price ?? service.price,
    description: service.description,
    includes: service.includes,
    suitableFor: service.suitableFor,
    hairstyleIds: service.hairstyleIds,
    // Empty means every chair is cleared, which is what a fixture wants.
    staffIds: [],
    popular: service.popular,
  })),
);

/** The sample salons the provider diary is seeded from.

    These are **not** the customer-facing catalogue any more — that comes from
    `/api/directory/` and is looked up through `useDirectoryStore`. What is
    left here backs the screens that still have no backend: the queue, the
    takings and the reviews. Nothing a customer sees reads any of it. */
export const fixtureSalonIds: string[] = SEEDS.map((seed) => seed.id);

export const fixtureStaffFor = (professionalId: string): StaffMember[] =>
  mockStaff.filter((member) => member.professionalId === professionalId);

export const fixtureServicesFor = (professionalId: string): Service[] =>
  mockServices.filter((service) => service.professionalId === professionalId);
