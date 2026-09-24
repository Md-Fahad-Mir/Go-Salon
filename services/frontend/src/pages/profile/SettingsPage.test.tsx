/* Settings: where a customer adds a salon.

   The scanner used to be reached from Home's salon list. It lives here now,
   and the case that matters most is the customer with no salon yet — the
   switcher hides itself for them, and this must not. */

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { serve } from '../../test/http';
import { mount } from '../../test/render';
import type { Tenant, User } from '../../types';
import SettingsPage from './SettingsPage';

/* Appearance reads the theme, and the theme provider reads `matchMedia`,
   which jsdom does not have. Nothing here is about the theme. */
vi.mock('../../components/profile/AppearanceSection', () => ({
  AppearanceSection: () => null,
}));

const ALPHA: Tenant = { id: 4, slug: 'alpha', listingId: 'salon-4', name: 'Aurora Salon', avatar: '' };

const customer = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z', credits: 3,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
  store().setSession({ user: customer(), access: 'a', refresh: 'r' });
  serve();
});

const open = () =>
  mount({
    at: '/profile/settings',
    routes: { '/profile/settings': <SettingsPage /> },
    elsewhere: <p>somewhere else</p>,
  });

describe('adding a salon', () => {
  it('offers the scanner to a customer with no salon — the switcher does not', () => {
    store().setTenants([]);
    open();

    expect(screen.getByRole('heading', { name: 'Add a salon' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Scan a salon’s QR code/ })).toHaveAttribute('href', '/join-salon');
    // The switcher is absent at zero salons; the way in is not. Named, because
    // the language picker beside it is a radio group too.
    expect(screen.queryByRole('radiogroup', { name: 'Salon' })).not.toBeInTheDocument();
  });

  it('sits beside the switcher, not inside it, once there are salons', () => {
    store().setTenants([ALPHA]);
    open();

    expect(screen.getByRole('radio', { name: /Aurora Salon/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Scan a salon’s QR code/ })).toHaveAttribute('href', '/join-salon');
  });

  it('says where the code is', () => {
    store().setTenants([]);
    open();
    expect(screen.getByText(/Ask at the counter/)).toBeInTheDocument();
  });
});
