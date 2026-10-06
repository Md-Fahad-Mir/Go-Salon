/* A day that cannot be picked says why: gone, too far off, or closed. */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../test/render';
import { Calendar } from './Calendar';

/** October 2026: the 6th is a Tuesday, the 9th a Friday. */
const open = () => {
  const onChange = vi.fn();
  mount({
    at: '/',
    routes: {
      '/': (
        <Calendar
          onChange={onChange}
          minDate={new Date(2026, 9, 6)}
          maxDate={new Date(2026, 9, 20)}
          isDayDisabled={(key) => key === '2026-10-09'}
          disabledReason={() => 'Closed every Friday — pick another day.'}
        />
      ),
    },
  });
  return onChange;
};

const day = (name: string) => screen.getByRole('gridcell', { name });

describe('a day that is not on offer', () => {
  it('says it has passed', async () => {
    const user = userEvent.setup();
    const onChange = open();

    await user.click(day('Monday 5 October'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('This day has already passed.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says how far ahead the calendar goes', async () => {
    const user = userEvent.setup();
    open();

    await user.click(day('Wednesday 21 October'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Too far ahead — pick a day up to 20 October.');
  });

  it('uses the caller’s reason for a day it ruled out', async () => {
    const user = userEvent.setup();
    const onChange = open();

    await user.click(day('Friday 9 October'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Closed every Friday');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves an open day alone', async () => {
    const user = userEvent.setup();
    const onChange = open();

    await user.click(day('Wednesday 7 October'));

    expect(onChange).toHaveBeenCalledWith('2026-10-07');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
