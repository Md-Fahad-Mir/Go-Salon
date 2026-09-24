/* The customer sign-up, trimmed to the account and the code.

   The point of these is the request, not the form. Removing two screens of
   fields is only safe if what still goes on the wire is what the backend
   requires — and `CustomerRegistrationSerializer` (Apps/users/serializers.py)
   requires exactly `phone`, `name` (2–80 chars), `password` and a true
   `accepted_terms`; `gender`, `hair_type`, `hair_length` and `location` are
   `required=False` with empty defaults. So the body is asserted key by key,
   including the keys that must NOT be there any more. */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { sent, serve } from '../../../test/http';
import { mount } from '../../../test/render';
import CustomerRegisterPage from './CustomerRegisterPage';

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

/** What `/api/auth/register/customer/` answers with: the account, made but
    unverified, and how long until another code may be asked for. */
const REGISTERED = {
  detail: 'We sent a code.',
  verification_required: true,
  phone: '+8801712345678',
  purpose: 'registration',
  resend_in: 60,
  expires_in_minutes: 10,
  user: {
    id: 42, phone: '+8801712345678', name: 'Test Person', email: '', role: 'customer',
    is_phone_verified: false, try_on_credits: 3, date_joined: '2026-09-24T04:30:00Z',
  },
};

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
});

const open = () =>
  mount({
    at: '/auth/register/customer',
    routes: {
      '/auth/register/customer': <CustomerRegisterPage />,
      '/auth/otp': <p>the code screen</p>,
      '/auth/register': <p>the account chooser</p>,
    },
    elsewhere: <p>somewhere else</p>,
  });

/** The last request's JSON body — the harness records headers, not bodies. */
const lastBody = (): Record<string, unknown> => {
  const calls = vi.mocked(fetch).mock.calls;
  const init = calls[calls.length - 1][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
};

const fillAccount = async () => {
  await userEvent.type(screen.getByLabelText('Mobile number'), '1712345678');
  await userEvent.type(screen.getByLabelText('Your name'), 'Test Person');
  await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd99');
};

describe('what the sign-up asks', () => {
  it('is one step: the account', () => {
    serve();
    open();
    expect(screen.getByText('Step 1 of 1 · About you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete sign up' })).toBeInTheDocument();
  });

  it('asks for no hair profile and no area', () => {
    serve();
    open();
    // The dropped steps were tile grids and chip rows, every one a `group`.
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryByText(/hair/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/area/i)).not.toBeInTheDocument();
  });

  it('still asks for the terms, because the server will not do without them', async () => {
    serve();
    open();
    await fillAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Complete sign up' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Accept the terms to create an account.');
    expect(sent).toHaveLength(0);
    // The wizard reveals a problem by focusing the first invalid field. The
    // box has to be one, and has to point at the reason.
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAttribute('aria-describedby', alert.id);
    await waitFor(() => expect(box).toHaveFocus());
  });
});

describe('what goes on the wire', () => {
  it('sends exactly what the backend requires, and nothing it no longer asks', async () => {
    serve({ status: 201, body: REGISTERED });
    open();
    await fillAccount();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Complete sign up' }));

    expect(await screen.findByText('the code screen')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('http://api.test/api/auth/register/customer/');
    expect(sent[0].method).toBe('POST');

    const body = lastBody();
    // The four the serializer requires, in the form it requires them.
    expect(body).toMatchObject({
      phone: '+8801712345678',
      name: 'Test Person',
      password: 'Passw0rd99',
      accepted_terms: true,
    });
    // Optional on the server, and the trimmed form has nothing to say: an
    // empty email is the serializer's own default, and `gender` still goes as
    // '' the way the client always sent it.
    expect(body.email).toBe('');
    expect(body.gender).toBe('');
    // The fields the dropped screens collected. `hair_type` and `hair_length`
    // are `undefined` on the request and JSON leaves them out; `location`
    // was never set. A key here is a screen that came back.
    expect(body).not.toHaveProperty('hair_type');
    expect(body).not.toHaveProperty('hair_length');
    expect(body).not.toHaveProperty('location');
    expect(Object.keys(body).sort()).toEqual(
      ['accepted_terms', 'email', 'gender', 'name', 'password', 'phone'],
    );
  });

  it('parks the sign-up for the code screen, signed in to nothing yet', async () => {
    serve({ status: 201, body: REGISTERED });
    open();
    await fillAccount();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Complete sign up' }));

    await screen.findByText('the code screen');
    expect(store().pendingVerification).toEqual({
      phone: '+8801712345678', purpose: 'registration', resendIn: 60,
    });
    expect(store().isAuthenticated).toBe(false);
  });

  it('says a number is taken the way the server actually says it', async () => {
    /* The real shape, not a convenient one. `validate_phone` raises DRF's
       `Conflict`, which is not a `ValidationError`, so it escapes the
       per-field collection and the handler sends `errors: {}` — there is no
       `errors.phone` to put under the field. What the person sees is the
       toast that `authErrorMessage` maps `phone_taken` to. */
    serve({
      status: 409,
      body: { detail: 'An account with this number already exists. Sign in instead.',
              code: 'phone_taken', errors: {} },
    });
    open();
    await fillAccount();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Complete sign up' }));

    await waitFor(() => expect(store().toasts).toHaveLength(1));
    expect(store().toasts[0]).toMatchObject({
      tone: 'error',
      message: 'An account already uses that number. Sign in instead.',
    });
    expect(screen.queryByText('the code screen')).not.toBeInTheDocument();
    // Still on the form, able to fix it and try again.
    expect(screen.getByRole('button', { name: 'Complete sign up' })).toBeEnabled();
  });
});
