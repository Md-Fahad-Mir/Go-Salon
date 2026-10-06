/* Two ways into the booking wizard from a salon's page, and only one of them
   asks who.

   "Book with Rafi" has already answered that, so it goes straight to Rafi's
   menu and the wizard is three steps long. "Book an appointment" is the open
   question, and keeps the stylist step — even straight after backing out of
   a "Book with" draft for the same salon.

   The salon page and the wizard steps are the real ones; only `fetch` is
   faked. */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { useBookingStore } from '../../store/useBookingStore';
import { useDirectoryStore } from '../../store/useDirectoryStore';
import { route } from '../../test/http';
import { listingWire } from '../../test/listing';
import { mount } from '../../test/render';
import type { User } from '../../types';
import ProfessionalDetailPage from '../ProfessionalDetailPage';
import ServiceSelectPage from './ServiceSelectPage';
import StaffSelectPage from './StaffSelectPage';

const customer = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z',
});

const PRISTINE = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  useDirectoryStore.getState().clear();
  useBookingStore.getState().reset();
  useAppStore.getState().setAuthStatus('ready');
  useAppStore.getState().setSession({ user: customer(), access: 'a', refresh: 'r' });
  route([['/listings/salon-4/', { status: 200, body: listingWire() }]]);
});

const open = (at = '/professional/salon-4') =>
  mount({
    at,
    routes: {
      '/professional/:id': <ProfessionalDetailPage />,
      '/booking/:professionalId/staff': <StaffSelectPage />,
      '/booking/:professionalId/service': <ServiceSelectPage />,
    },
  });

describe('booking from a stylist’s own button', () => {
  it('skips choosing a stylist and opens their menu as step one of three', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Book with Rafi' }));

    expect(await screen.findByText('Pick your services')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3 · Services')).toBeInTheDocument();
    expect(screen.getByText(/What Rafi can do for you/)).toBeInTheDocument();
    expect(screen.queryByText('Who will cut your hair?')).not.toBeInTheDocument();
    expect(useBookingStore.getState().draft).toMatchObject({ staffId: 'e1', staffLocked: true });
  });

  it('sends the stylist step on to the menu if it is reached anyway', async () => {
    useBookingStore.getState().start('salon-4', { staffId: 'e1', serviceIds: [], staffLocked: true });
    open('/booking/salon-4/staff');

    expect(await screen.findByText('Pick your services')).toBeInTheDocument();
    expect(screen.queryByText('Who will cut your hair?')).not.toBeInTheDocument();
  });
});

describe('booking an appointment with the salon', () => {
  it('still asks who, as step one of four', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Book an appointment' }));

    expect(await screen.findByText('Who will cut your hair?')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4 · Stylist')).toBeInTheDocument();
  });

  it('asks who even after a "Book with" draft for the same salon', async () => {
    // Pressed "Book with Rafi", came back, and now wants the open choice.
    useBookingStore.getState().start('salon-4', { staffId: 'e1', serviceIds: [], staffLocked: true });
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Book an appointment' }));

    expect(await screen.findByText('Who will cut your hair?')).toBeInTheDocument();
    // Rafi is still the one ticked — only the lock is gone.
    expect(useBookingStore.getState().draft).toMatchObject({ staffId: 'e1' });
    expect(useBookingStore.getState().draft?.staffLocked).toBeUndefined();
  });
});
