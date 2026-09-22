import type { AppNotification } from '../types';
import { isoDaysAgo, isoHoursAgo } from './base';

export const demoNotifications: AppNotification[] = [
  {
    id: 'NTF-1', kind: 'booking', title: 'Booking confirmed',
    body: 'Persona Gents Salon confirmed your textured crop with Rafiq Islam.',
    createdAt: isoHoursAgo(3, 12), read: false, link: '/bookings/BOOK-A',
  },
  {
    id: 'NTF-2', kind: 'booking', title: 'Awaiting approval',
    body: 'Glow Beauty Lounge approves bookings by hand. You will hear back within a day.',
    createdAt: isoHoursAgo(9, 5), read: false, link: '/bookings/BOOK-B',
  },
  {
    id: 'NTF-3', kind: 'promo', title: '10 try-on credits for ৳199',
    body: 'Top up and preview the whole trending shelf before you book.',
    createdAt: isoDaysAgo(2, 11, 0), read: true, link: '/ai-tryon',
  },
  {
    id: 'NTF-4', kind: 'booking', title: 'How was your visit?',
    body: 'Rate your skin fade and beard trim at Persona Gents Salon.',
    createdAt: isoDaysAgo(9, 18, 30), read: true, link: '/bookings/BOOK-C',
  },
  {
    id: 'NTF-5', kind: 'system', title: 'Welcome to Eureka',
    body: 'Your first three try-ons are on us. See the cut before the cut.',
    createdAt: isoDaysAgo(20, 9, 0), read: true, link: '/ai-tryon',
  },
];
