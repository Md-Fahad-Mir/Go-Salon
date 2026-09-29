/* One salon as `/api/listings/{id}/` sends it, for the screens that render a
   salon in full. Realistic on purpose — a menu with a popular item, a team
   with one new chair, a closed day, a gallery — because the profile branches
   on every one of those, and a fixture that took the easy path through each
   would pin the easy path. */

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const week = (closedOn: (typeof DAYS)[number] = 'fri') =>
  DAYS.map((day) => ({
    day,
    is_closed: day === closedOn,
    intervals: day === closedOn ? [] : [{ start: '10:00', end: '20:00' }],
  }));

/** The wire shape of one listing. `over` replaces top-level fields, so a
    second salon is `listingWire({ id: 'salon-5', name: 'Bluebell Parlour' })`. */
export const listingWire = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'salon-4',
  kind: 'salon',
  type: 'salon',
  name: 'Aurora Salon',
  tagline: 'Sharp cuts, no fuss',
  bio: 'A small shop on Road 11 that has been cutting the same families for a decade.',
  audience: 'unisex',
  avatar: '',
  cover_image: '',
  gallery: [
    { id: 1, image: 'https://img.test/aurora-1.jpg', caption: 'The room' },
    { id: 2, image: 'https://img.test/aurora-2.jpg', caption: '' },
  ],
  location: { area: 'Banani', city: 'Dhaka', address: 'House 5, Road 11', latitude: 23.7937, longitude: 90.4066 },
  distance_km: 1.2,
  phone: '+8801711000000',
  email: 'hello@aurora.test',
  category: 'salon',
  specialties: ['Fades'],
  experience_years: 6,
  verified: true,
  accepting_clients: true,
  acceptance: 'auto',
  amenities: ['Wi-Fi', 'Card payment'],
  women_only: false,
  private_booth: false,
  price_from: 350,
  service_count: 3,
  staff_count: 2,
  hours: week(),
  open_now: true,
  services: [
    { id: 's1', name: 'Haircut', category: 'hair', description: '', price: 350, duration: 30, buffer_minutes: 5,
      audience: 'all', includes: [], steps: [], popular: true, eligible_employee_ids: ['e1', 'e2'] },
    { id: 's2', name: 'Beard trim', category: 'beard', description: '', price: 150, duration: 15, buffer_minutes: 0,
      audience: 'male', includes: [], steps: [], popular: false, eligible_employee_ids: ['e1'] },
    { id: 's3', name: 'Hair colour', category: 'colour', description: '', price: 1200, duration: 90, buffer_minutes: 10,
      audience: 'all', includes: [], steps: [], popular: false, eligible_employee_ids: ['e2'] },
  ],
  staff: [
    { id: 'e1', name: 'Rafi Ahmed', title: 'Senior barber', avatar: '', specialties: ['Fades', 'Beards'],
      experience_years: 6, chair_status: 'open', hours: week() },
    { id: 'e2', name: 'Nadia Islam', title: 'Colourist', avatar: '', specialties: ['Colour'],
      experience_years: 2, chair_status: 'open', hours: week('sun') },
  ],
  ...over,
});
