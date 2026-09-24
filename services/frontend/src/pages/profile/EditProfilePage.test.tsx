/* Editing a profile that has no hair and no area — which, since the sign-up
   stopped asking, is every customer who joined from a salon's QR code.

   The form used to refuse to save anything until hair type, hair length and
   an area were all chosen. The server has always treated them as optional
   (`CustomerProfileWriteSerializer`: `required=False, allow_blank=True`, and a
   location written only for the keys that are sent), so the form now does
   too — and must not quietly write an empty place over a stored one. */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { sent, serve } from '../../test/http';
import { mount } from '../../test/render';
import type { User } from '../../types';
import EditProfilePage from './EditProfilePage';

/** A customer exactly as the trimmed sign-up leaves them. */
const fresh = (over: Partial<User> = {}): User => ({
  id: '42', name: 'Test Person', role: 'customer',
  phone: '+8801712345678', createdAt: '2026-09-24T04:30:00Z', credits: 3,
  ...over,
});

/** `GET/PATCH /api/profile/me/` for that customer, after the save. */
const savedAs = (name: string) => ({
  role: 'customer',
  account: {
    id: 42, phone: '+8801712345678', name, email: '', role: 'customer',
    is_phone_verified: true, try_on_credits: 3, date_joined: '2026-09-24T04:30:00Z',
  },
  customer: {
    avatar: '', gender: '', hair_type: '', hair_length: '',
    location: { area: '', city: '', address: '', latitude: null, longitude: null },
  },
  barber: null,
  salon: null,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
});

const open = () =>
  mount({
    at: '/profile/edit',
    routes: { '/profile/edit': <EditProfilePage />, '/profile': <p>the profile screen</p> },
    elsewhere: <p>somewhere else</p>,
  });

const save = () => screen.getByRole('button', { name: 'Save changes' });

const lastBody = (): Record<string, unknown> => {
  const calls = vi.mocked(fetch).mock.calls;
  return JSON.parse(String((calls[calls.length - 1][1] as RequestInit).body)) as Record<string, unknown>;
};

describe('a customer with no hair profile and no area', () => {
  beforeEach(() => store().setSession({ user: fresh(), access: 'a', refresh: 'r' }));

  it('can save a new name without choosing any of them', async () => {
    serve({ status: 200, body: savedAs('Tahmid Rahman') });
    open();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Tahmid Rahman');
    expect(save()).toBeEnabled();
    await userEvent.click(save());

    expect(await screen.findByText('the profile screen')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('PATCH');
    const body = lastBody();
    expect(body.name).toBe('Tahmid Rahman');
    expect(body.hair_type).toBe('');
    expect(body.hair_length).toBe('');
    // No area chosen, so no place sent: an empty one would be written over
    // whatever the server holds.
    expect(body).not.toHaveProperty('location');
    expect(store().user?.name).toBe('Tahmid Rahman');
  });

  it('is not "changed" before anything has been touched', () => {
    serve();
    open();
    expect(save()).toBeDisabled();
  });
});

describe('the same customer after a save has refreshed their profile', () => {
  /* `profileService.toUser` maps an empty location to `{ area: '' }`, which no
     area chip is — so comparing the chip against the raw field called every
     such form changed from the moment it opened. */
  it('is still not "changed" before anything has been touched', () => {
    store().setSession({
      user: fresh({ location: { area: '', city: '', address: '', lat: 0, lng: 0 } }),
      access: 'a',
      refresh: 'r',
    });
    serve();
    open();
    expect(save()).toBeDisabled();
  });
});

describe('a customer who has an area', () => {
  it('still sends it, unchanged, alongside another edit', async () => {
    const banani = { area: 'Banani', city: 'Dhaka', address: 'Road 11', lat: 23.79, lng: 90.4 };
    store().setSession({ user: fresh({ location: banani, hairType: 'wavy', hairLength: 'short' }), access: 'a', refresh: 'r' });
    serve({ status: 200, body: savedAs('Tahmid Rahman') });
    open();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Tahmid Rahman');
    await userEvent.click(save());

    await screen.findByText('the profile screen');
    expect(lastBody().location).toEqual({
      area: 'Banani', city: 'Dhaka', address: 'Road 11', latitude: 23.79, longitude: 90.4,
    });
  });
});
