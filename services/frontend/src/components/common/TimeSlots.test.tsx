/* A time that cannot be picked says why, instead of only being grey.

   The component and the hint are the real ones; jsdom lays nothing out, so
   where the bubble sits is not tested here — only what it says, and when it
   comes and goes. */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../test/render';
import type { TimeSlot } from '../../types';
import { TimeSlots } from './TimeSlots';

const SLOTS: TimeSlot[] = [
  { time: '10:00', available: true },
  { time: '10:30', available: false, reason: 'taken' },
  { time: '11:00', available: false, reason: 'too_soon' },
  { time: '11:30', available: false, reason: 'outside_hours' },
  { time: '12:00', available: false, reason: 'something_new' },
];

const open = () => {
  const onChange = vi.fn();
  mount({ at: '/', routes: { '/': <TimeSlots slots={SLOTS} onChange={onChange} /> } });
  return onChange;
};

const slot = (time: RegExp) => screen.getByRole('button', { name: time });

describe('a time that is not on offer', () => {
  it('says why when pressed, and is not picked', async () => {
    const user = userEvent.setup();
    const onChange = open();

    await user.click(slot(/10:30/));

    const hint = await screen.findByRole('tooltip');
    expect(hint).toHaveTextContent('Already booked — try another time.');
    expect(slot(/10:30/)).toHaveAttribute('aria-describedby', hint.id);
    expect(slot(/10:30/)).toHaveAttribute('aria-disabled', 'true');
    // Read out once, on the press — not on every hover.
    expect(screen.getByRole('status')).toHaveTextContent('Already booked');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives each of the server’s reasons its own sentence', async () => {
    const user = userEvent.setup();
    open();

    await user.click(slot(/11:00/));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Too close to now to book.');

    await user.click(slot(/11:30/));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Outside working hours');

    // A reason this build has never heard of still gets a sentence.
    await user.click(slot(/12:00/));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('This time isn’t available.');
  });

  it('follows the mouse in, and leaves when it does', async () => {
    const user = userEvent.setup();
    open();

    await user.hover(slot(/10:30/));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Already booked');

    await user.unhover(slot(/10:30/));
    // It plays its way out rather than vanishing, then goes.
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-leaving', 'true');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('is put away by picking a time that is free', async () => {
    const user = userEvent.setup();
    const onChange = open();

    await user.click(slot(/10:30/));
    await screen.findByRole('tooltip');
    await user.click(slot(/^10:00/));

    expect(onChange).toHaveBeenCalledWith('10:00');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
});
