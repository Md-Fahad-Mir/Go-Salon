/* The code an owner prints and puts on the counter.

   The component, the store, the service and the api client are the real ones;
   only `fetch` is faked, and only the object-URL pair jsdom does not
   implement is stubbed (src/test/setup.dom.ts). */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../../store/useAppStore';
import { sent, serve } from '../../../test/http';
import { mount } from '../../../test/render';
import type { User } from '../../../types';
import { SalonQRSection } from './SalonQRSection';

/** A PNG, as far as anything here is concerned. */
const png = (mark: string) => new Blob([mark], { type: 'image/png' });

const owner = (): User => ({
  id: 'U1', name: 'Owner', role: 'salon_owner',
  phone: '+8801955000001', createdAt: '2026-01-01T00:00:00.000Z', credits: 0,
});

const PRISTINE = useAppStore.getState();
const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  store().setAuthStatus('ready');
  store().setSession({ user: owner(), access: 'a', refresh: 'r' });
});

const open = () => mount({ at: '/pro/salon', routes: { '/pro/salon': <SalonQRSection /> } });
const code = () => screen.getByAltText('The QR code customers scan to add your salon');

describe('showing the code', () => {
  it('fetches it and puts it on screen', async () => {
    serve({ status: 200, blob: png('first') });
    open();

    expect(await screen.findByAltText(/QR code customers scan/)).toBeInTheDocument();
    expect(code()).toHaveAttribute('src', expect.stringContaining('blob:'));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('http://api.test/api/salon/qr/');
    expect(sent[0].method).toBe('GET');
  });

  it('asks for it every time the screen opens, never from a cache', async () => {
    serve({ status: 200, blob: png('first') });
    const first = open();
    await screen.findByAltText(/QR code customers scan/);
    first.unmount();

    serve({ status: 200, blob: png('second') });
    open();
    await screen.findByAltText(/QR code customers scan/);
    // The token behind the image can rotate at any moment, which is why the
    // server sends `Cache-Control: no-store` and why this does not hold one.
    expect(sent).toHaveLength(1);
  });

  it('holds a spinner rather than a broken image while it loads', () => {
    serve({ status: 200, blob: png('first') });
    open();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code customers scan/)).not.toBeInTheDocument();
  });
});

describe('when it cannot be loaded', () => {
  it('says so, with the server’s own sentence, rather than a broken image', async () => {
    serve({
      status: 403,
      body: { detail: 'Only the owner of this business can do that.',
              code: 'permission_denied', errors: {} },
    });
    open();

    expect(await screen.findByText('We could not load your code')).toBeInTheDocument();
    expect(screen.getByText('Only the owner of this business can do that.')).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code customers scan/)).not.toBeInTheDocument();
  });

  it('refuses a 200 that is not an image', async () => {
    // A proxy's sign-in page would otherwise reach the <img> as a blob and
    // render as a broken icon with nothing to explain it.
    serve({ status: 200, body: { not: 'a png' } });
    open();
    expect(await screen.findByText('We could not load your code')).toBeInTheDocument();
  });

  it('asks again when told to', async () => {
    const user = userEvent.setup();
    serve('unreachable');
    open();
    await screen.findByText('We could not load your code');

    serve({ status: 200, blob: png('first') });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByAltText(/QR code customers scan/)).toBeInTheDocument();
  });
});

describe('saving it', () => {
  it('hands the image to the device the way every other save here does', async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    serve({ status: 200, blob: png('first') });
    open();
    await screen.findByAltText(/QR code customers scan/);

    await user.click(screen.getByRole('button', { name: 'Save the image' }));

    // `downloadBlob` — an anchor with a `download` name, clicked. The same
    // mechanism the try-on results already use.
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('eureka-join-code.png');
    // Saving is local: nothing is asked of the server.
    expect(sent).toHaveLength(1);
  });
});

describe('making a new code', () => {
  const load = async () => {
    serve({ status: 200, blob: png('first') });
    open();
    await screen.findByAltText(/QR code customers scan/);
  };

  it('asks first, and says plainly what it costs', async () => {
    const user = userEvent.setup();
    await load();

    await user.click(screen.getByRole('button', { name: 'Make a new code' }));

    expect(await screen.findByText('Make a new code?')).toBeInTheDocument();
    expect(screen.getByText(/Every printed copy of your current code stops working/))
      .toBeInTheDocument();
    // Nothing has been asked of the server yet — the first GET is all.
    expect(sent).toHaveLength(1);
  });

  it('rotates the token and replaces what is on screen', async () => {
    const user = userEvent.setup();
    await load();
    const before = code().getAttribute('src');

    await user.click(screen.getByRole('button', { name: 'Make a new code' }));
    serve({ status: 200, blob: png('second') });
    await user.click(await screen.findByRole('button', { name: 'Replace the code' }));

    await waitFor(() => expect(code().getAttribute('src')).not.toBe(before));
    expect(sent[0].url).toBe('http://api.test/api/salon/qr/regenerate/');
    expect(sent[0].method).toBe('POST');
    // No stale image, and nothing to press to refresh it.
    expect(screen.queryByText('Make a new code?')).not.toBeInTheDocument();
  });

  it('changes nothing when the asking is dismissed', async () => {
    const user = userEvent.setup();
    await load();
    const before = code().getAttribute('src');

    await user.click(screen.getByRole('button', { name: 'Make a new code' }));
    await screen.findByText('Make a new code?');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(code()).toHaveAttribute('src', before!);
    expect(sent).toHaveLength(1); // still just the first GET
  });

  it('keeps the working code on screen when the rotation fails', async () => {
    const user = userEvent.setup();
    await load();
    const before = code().getAttribute('src');

    await user.click(screen.getByRole('button', { name: 'Make a new code' }));
    serve({ status: 500 });
    await user.click(await screen.findByRole('button', { name: 'Replace the code' }));

    // The server leaves the old token alone when it refuses, so the code on
    // the wall is still the live one — and the screen must keep showing it.
    await waitFor(() => expect(screen.queryByText('Make a new code?')).not.toBeInTheDocument());
    expect(code()).toHaveAttribute('src', before!);
  });
});
