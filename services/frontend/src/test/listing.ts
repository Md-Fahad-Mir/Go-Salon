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
  rating: 4.6,
  review_count: 12,
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
      experience_years: 6, chair_status: 'open', rating: 4.8, review_count: 9, hours: week() },
    { id: 'e2', name: 'Nadia Islam', title: 'Colourist', avatar: '', specialties: ['Colour'],
      experience_years: 2, chair_status: 'open', rating: null, review_count: 0, hours: week('sun') },
  ],
  ...over,
});

/** The first page of that salon's reviews, as `/api/reviews/listing/{id}/` sends it. */
export const reviewsWire = (professionalId = 'salon-4', professionalName = 'Aurora Salon') => ({
  results: [
    { id: 71, professional_id: professionalId, professional_name: professionalName, booking_id: 'B1',
      user_id: 'U9', user_name: 'Tanvir H.', rating: 5, text: 'Clean fade, exactly what I asked for.',
      service_name: 'Haircut', staff_name: 'Rafi Ahmed', reply: '', replied_at: null, replied_by_name: '',
      can_reply: false, created_at: '2026-09-20T09:00:00Z' },
    { id: 70, professional_id: professionalId, professional_name: professionalName, booking_id: 'B2',
      user_id: 'U8', user_name: 'Maliha R.', rating: 4, text: 'Good colour, ran a little late.',
      service_name: 'Hair colour', staff_name: 'Nadia Islam', reply: 'Sorry about the wait!',
      replied_at: '2026-09-19T12:00:00Z', replied_by_name: 'Aurora Salon', can_reply: false,
      created_at: '2026-09-18T15:30:00Z' },
  ],
  summary: { average: 4.6, count: 12, breakdown: { 5: 8, 4: 3, 3: 1, 2: 0, 1: 0 } },
  page: 1,
  pages: 4,
  count: 12,
});
