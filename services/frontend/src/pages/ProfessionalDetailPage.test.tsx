/* The salon profile at `/professional/:id`, pinned byte for byte.

   FR2 lifts this screen's body into `components/salon/SalonProfile.tsx` so the
   customer's Home can render the salon they are in. That is a refactor, and a
   refactor that changes what this route renders is a bug — so the whole
   document is snapshotted here against the page as it stood BEFORE the
   extraction, and the extraction is only correct if this test still passes
   with the stored snapshot untouched.

   Time is fixed, because the screen renders "today": the hours row, the
   open/closed badge, and the highlighted day of the week all move with the
   clock. Thursday 24 September 2026, mid-morning, Dhaka. */

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { useDirectoryStore } from '../store/useDirectoryStore';
import { route } from '../test/http';
import { listingWire } from '../test/listing';
import { mount } from '../test/render';
import type { User } from '../types';
import ProfessionalDetailPage from './ProfessionalDetailPage';

const customer = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z', credits: 3,
});

const PRISTINE = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  useDirectoryStore.getState().clear();
  useAppStore.getState().setAuthStatus('ready');
  useAppStore.getState().setSession({ user: customer(), access: 'a', refresh: 'r' });
  // Only the clock. Timers stay real so Testing Library's polling still runs.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T10:30:00+06:00'));
});

afterEach(() => vi.useRealTimers());

describe('the salon profile at /professional/:id', () => {
  it('renders exactly what it rendered before the extraction', async () => {
    route([
      ['/listings/salon-4/', { status: 200, body: listingWire() }],
    ]);
    const { container } = mount({
      at: '/professional/salon-4',
      routes: { '/professional/:id': <ProfessionalDetailPage /> },
    });

    // The fetch has landed once the menu is on screen.
    await screen.findByText('Haircut');

    expect(container.innerHTML).toMatchSnapshot();
  });

  it('keeps its back arrow: this is a screen someone navigated to', async () => {
    route([
      ['/listings/salon-4/', { status: 200, body: listingWire() }],
    ]);
    mount({ at: '/professional/salon-4', routes: { '/professional/:id': <ProfessionalDetailPage /> } });

    await screen.findByText('Haircut');
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    // And no bell — that is Home's, not this route's.
    expect(screen.queryByRole('button', { name: /notification/i })).not.toBeInTheDocument();
  });
});

describe('the team', () => {
  it("shows each stylist's own photo, and initials for one who has none", async () => {
    const photo = 'https://img.test/rafi.jpg';
    const base = listingWire();
    const staff = (base.staff as Array<Record<string, unknown>>).map((member) =>
      member.id === 'e1' ? { ...member, avatar: photo } : member,
    );
    route([['/listings/salon-4/', { status: 200, body: { ...base, staff } }]]);
    mount({ at: '/professional/salon-4', routes: { '/professional/:id': <ProfessionalDetailPage /> } });

    await screen.findByText('Haircut');
    expect(screen.getByRole('img', { name: 'Rafi Ahmed' })).toHaveAttribute('src', photo);
    // Nadia has no photo: her initials stand in, not a broken image.
    expect(screen.queryByRole('img', { name: 'Nadia Islam' })).not.toBeInTheDocument();
    expect(screen.getByText('NI')).toBeInTheDocument();
  });
});
