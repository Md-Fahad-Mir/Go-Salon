/* Settings holds no salon controls and no language picker for a customer.

   Adding, switching and removing a salon all live on Home, behind the salon's
   avatar in the header, and a customer with no salon is sent from Home's
   empty state straight to the scanner. Settings keeping a second copy of any
   of it is what this pins down. The language is changed from the button
   beside Home's bell, so it is not here either. */

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

describe('salons', () => {
  it('are not managed here, with or without one', () => {
    for (const tenants of [[], [ALPHA]]) {
      store().setTenants(tenants);
      const view = open();

      expect(screen.queryByRole('heading', { name: 'Add a salon' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Scan a salon’s QR code/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /Aurora Salon/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Remove a salon')).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('language', () => {
  it('is not changed here — Home has its own button for it', () => {
    open();
    expect(screen.queryByRole('heading', { name: 'Language' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /English/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /বাংলা/ })).not.toBeInTheDocument();
  });
});
