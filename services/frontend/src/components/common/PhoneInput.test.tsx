/* The phone field: a country, and the number the way that country writes it.

   What matters is what the form gets handed — E.164, ready for the API — so
   every test reads the value the field reported, not only what it shows. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../LanguageProvider';
import { PhoneInput } from './PhoneInput';

/** The last value the field handed up. */
let reported = '';

function Form({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneInput
      value={value}
      onChange={(next) => {
        reported = next;
        setValue(next);
      }}
    />
  );
}

const open = (initial?: string) =>
  render(
    <LanguageProvider>
      <Form initial={initial} />
    </LanguageProvider>,
  );

const field = () => screen.getByLabelText('Mobile number');
const country = () => screen.getByLabelText<HTMLSelectElement>('Country code');

beforeEach(() => {
  reported = '';
  // The field remembers the last country picked; one test must not pick for the next.
  localStorage.clear();
});

describe('the phone field', () => {
  it('opens on the default country and takes its numbers as before', async () => {
    open();
    expect(country().value).toBe('BD');
    await userEvent.type(field(), '01712345678');
    expect(reported).toBe('+8801712345678');
    expect(field()).toHaveValue('1712 345678');
  });

  it('takes a number from any country once that country is picked', async () => {
    open();
    await userEvent.selectOptions(country(), 'GB');
    await userEvent.type(field(), '07400 123456');
    expect(reported).toBe('+447400123456');
    expect(country().value).toBe('GB');
  });

  it('keeps the digits already typed when the country changes', async () => {
    open();
    await userEvent.type(field(), '2133734253');
    await userEvent.selectOptions(country(), 'US');
    expect(reported).toBe('+12133734253');
  });

  it('picks the country itself when a number is pasted with its calling code', async () => {
    open();
    await userEvent.click(field());
    await userEvent.paste('+971 50 123 4567');
    expect(reported).toBe('+971501234567');
    expect(country().value).toBe('AE');
  });

  it('shows a saved number in its own country', () => {
    open('+919876543210');
    expect(country().value).toBe('IN');
    expect(field()).toHaveValue('98765 43210');
  });

  it('remembers the country picked on this device', async () => {
    const { unmount } = open();
    await userEvent.selectOptions(country(), 'CA');
    unmount();
    open();
    expect(country().value).toBe('CA');
  });
});
