/* Settings holds no salon controls, no language picker and no light/dark
   switch for a customer.

   Adding, switching and removing a salon all live on Home, behind the salon's
   avatar in the header, and a customer with no salon is sent from Home's
   empty state straight to the scanner. Settings keeping a second copy of any
   of it is what this pins down. The language is changed from the button
   beside Home's bell, so it is not here either. */

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { serve } from '../../test/http';
import { mount } from '../../test/render';
import type { Tenant, User } from '../../types';
import SettingsPage from './SettingsPage';

const ALPHA: Tenant = { id: 4, slug: 'alpha', listingId: 'salon-4', name: 'Aurora Salon', avatar: '' };

const customer = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z',
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

describe('appearance', () => {
  it('is not changed here — Home has its own light/dark button', () => {
    open();
    expect(screen.queryByRole('heading', { name: 'Appearance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Light|Dark|System/ })).not.toBeInTheDocument();
  });
});

describe('what was taken out', () => {
  it('has no offers switch and no "rate the app" row', () => {
    open();
    expect(screen.queryByText(/Offers and new styles/)).not.toBeInTheDocument();
    expect(screen.queryByText('Rate the app')).not.toBeInTheDocument();
    // SMS reminders and booking updates, plus "save my results".
    expect(screen.getAllByRole('switch')).toHaveLength(3);
  });

  it('offers no way into "clear history" when nothing is saved', () => {
    open();
    expect(screen.queryByRole('button', { name: /Clear try-on history/ })).not.toBeInTheDocument();
    expect(screen.getByText('Clear try-on history')).toBeInTheDocument();
  });
});
