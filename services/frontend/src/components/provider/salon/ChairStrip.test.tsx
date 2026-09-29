/* The chair strip on the owner's floor: each stylist's own photo, and their
   initials when they have not set one. */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mount } from '../../../test/render';
import type { StaffRecord } from '../../../types';
import { ChairStrip } from './ChairStrip';

const member = (over: Partial<StaffRecord>): StaffRecord => ({
  id: '1', userId: 'u1', name: 'Sakib Hossain', phone: '+8801711000001', title: 'Stylist',
  commissionRate: 0, active: true, hasOwnSchedule: false, serviceIds: [], avatar: '',
  bio: '', specialties: [], experienceYears: 3, phoneVerified: true, joinedAt: '2026-01-01',
  ...over,
});

describe('the chair strip', () => {
  it("shows each stylist's own photo, and initials for one who has none", () => {
    const photo = 'https://img.test/sakib.jpg';
    mount({
      at: '/',
      routes: {
        '/': (
          <ChairStrip
            staff={[member({ avatar: photo }), member({ id: '2', userId: 'u2', name: 'Tanvir Ahmed' })]}
            appointments={[]}
            selectedId={null}
            onSelect={() => {}}
          />
        ),
      },
    });

    expect(screen.getByRole('img', { name: 'Sakib Hossain' })).toHaveAttribute('src', photo);
    expect(screen.queryByRole('img', { name: 'Tanvir Ahmed' })).not.toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
  });
});
