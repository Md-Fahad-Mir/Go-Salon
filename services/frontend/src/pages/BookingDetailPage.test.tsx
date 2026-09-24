/* The booking a customer opens when something needs sorting out.

   One thing is pinned here: the number to ring works whether or not this
   device happens to have that salon's details cached. */

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { useDirectoryStore } from '../store/useDirectoryStore';
import { serve } from '../test/http';
import { mount } from '../test/render';
import type { Booking, User } from '../types';
import BookingDetailPage from './BookingDetailPage';

const BOOKING: Booking = {
  id: 'BK1',
  professionalId: 'salon-4',
  professionalName: 'Aurora Salon',
  businessPhone: '+8801711000001',
  staffId: 'EMP1',
  staffName: 'Hasan Mahmud',
  customerName: 'Test Person',
  customerPhone: '+8801955000009',
  services: [{ id: 'SV1', name: 'Signature Cut', price: 1200, duration: 45 }],
  date: '2099-01-01',
  time: '11:00',
  endTime: '11:45',
  duration: 45,
  subtotal: 1200,
  platformFee: 50,
  total: 1250,
  status: 'approved',
  cancellationWindowHours: 2,
  cancelDeadline: '2099-01-01T03:00:00.000Z',
  can: {
    approve: false, reject: false, complete: false,
    cancel: true, reschedule: true, callToCancel: false, review: false,
  },
  startsAt: '2099-01-01T05:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const someone = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z', credits: 3,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  useDirectoryStore.getState().clear();
  store().setAuthStatus('ready');
  store().setSession({ user: someone(), access: 'a', refresh: 'r' });
  store().setBookings([BOOKING]);
});

const open = () =>
  mount({ at: '/bookings/BK1', routes: { '/bookings/:id': <BookingDetailPage /> } });

describe('the number to ring', () => {
  it('works when this device has never opened that salon', async () => {
    // The directory cache is empty — a booking made on another phone, or one
    // opened after site data was cleared. The re-read on mount is allowed to
    // fail; the screen renders from what it holds.
    expect(useDirectoryStore.getState().byId).toEqual({});
    serve('unreachable');
    open();

    const call = await screen.findByRole('link', { name: /Call/ });
    expect(call).toHaveAttribute('href', 'tel:+8801711000001');
  });

  it('takes the number from the booking, not from the cached salon', async () => {
    // A cache that disagrees proves which one is being read.
    useDirectoryStore.setState({
      byId: {
        'salon-4': {
          id: 'salon-4',
          phone: '+8809999999999',
          location: { area: 'Gulshan', city: 'Dhaka', address: '12 Road 3', lat: 0, lng: 0 },
        } as never,
      },
    });
    serve('unreachable');
    open();

    const call = await screen.findByRole('link', { name: /Call/ });
    expect(call).toHaveAttribute('href', 'tel:+8801711000001');
    // And the cached salon is genuinely being read for the other button, so
    // this is not passing because the cache was ignored entirely.
    expect(screen.getByRole('link', { name: /Directions/ })).toBeInTheDocument();
  });

  it('offers no directions when the address is not cached', async () => {
    serve('unreachable');
    open();

    await screen.findByRole('link', { name: /Call/ });
    // An address is the one thing the booking payload does not carry, so this
    // is absent rather than wrong when the cache is cold.
    expect(screen.queryByRole('link', { name: /Directions/ })).not.toBeInTheDocument();
  });
});
