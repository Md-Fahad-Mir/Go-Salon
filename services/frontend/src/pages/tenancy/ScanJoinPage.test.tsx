/* The in-app scanner.

   The scanner's whole job is turning a camera frame into a token and handing
   it to `/join/:token`. These tests check that job and stop there: what the
   token then does is JoinPage's, and is tested once, in JoinPage's own file. */

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { fakeAnimationFrames, fakeCamera, fakeVideoAndCanvas } from '../../test/camera';
import { sent, serve } from '../../test/http';
import { mount } from '../../test/render';
import type { User } from '../../types';
import ScanJoinPage from './ScanJoinPage';

const decode = vi.hoisted(() => vi.fn());
vi.mock('jsqr', () => ({ default: decode }));

const TOKEN = 'a'.repeat(43);

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
  decode.mockReset();
  decode.mockReturnValue(null);
});

afterEach(() => vi.restoreAllMocks());

/** The scanner, plus a stand-in for the screen it hands a token to. */
const open = () =>
  mount({
    at: '/join-salon',
    routes: {
      '/join-salon': <ScanJoinPage />,
      '/join/:token': <p>the join screen</p>,
    },
    elsewhere: <p>somewhere else</p>,
  });

describe('scanning a salon’s code', () => {
  beforeEach(() => {
    fakeVideoAndCanvas();
    fakeAnimationFrames();
  });

  it('hands the token to the join screen rather than joining itself', async () => {
    fakeCamera('granted');
    decode.mockReturnValue({ data: `https://app.gosalon.com/join/${TOKEN}` });
    serve(); // any request from this screen would throw
    open();

    expect(await screen.findByText('the join screen')).toBeInTheDocument();
    // There is no second join path to keep in step, because there is no
    // second join: the POST happens once, on the screen it was always on.
    expect(sent).toHaveLength(0);
    expect(store().tenants).toEqual([]);
  });

  it('reads a code printed against any deployment’s base URL', async () => {
    // JOIN_URL_BASE is a server setting and differs per environment, so the
    // path is the contract, not the origin.
    fakeCamera('granted');
    decode.mockReturnValue({ data: `http://localhost:5173/join/${TOKEN}` });
    serve();
    open();

    expect(await screen.findByText('the join screen')).toBeInTheDocument();
  });

  it('lets go of the camera once it has what it came for', async () => {
    const { tracks } = fakeCamera('granted');
    decode.mockReturnValue({ data: `https://app.gosalon.com/join/${TOKEN}` });
    serve();
    open();

    await screen.findByText('the join screen');
    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
  });
});

describe('a QR code that is not ours', () => {
  beforeEach(() => {
    fakeVideoAndCanvas();
    fakeAnimationFrames();
  });

  it('says so and keeps looking, rather than going quiet', async () => {
    fakeCamera('granted');
    decode.mockReturnValue({ data: 'https://example.com/wifi?ssid=salon' });
    serve();
    open();

    // Announced, because somebody pointing a phone at a poster is not reading
    // the caption under the viewfinder.
    expect(await screen.findByText(/not a salon code/)).toBeInTheDocument();
    expect(screen.queryByText('the join screen')).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('refuses a join URL whose token is the wrong shape', async () => {
    fakeCamera('granted');
    decode.mockReturnValue({ data: 'https://app.gosalon.com/join/short' });
    serve();
    open();

    expect(await screen.findByText(/not a salon code/)).toBeInTheDocument();
    expect(screen.queryByText('the join screen')).not.toBeInTheDocument();
  });

  it('refuses a token-shaped code that is not a join link', async () => {
    // The path is the contract, not just its shape: a 43-character segment
    // under some other path is somebody else's QR that happens to rhyme.
    fakeCamera('granted');
    decode.mockReturnValue({ data: `https://example.com/promo/${TOKEN}` });
    serve();
    open();

    expect(await screen.findByText(/not a salon code/)).toBeInTheDocument();
    expect(screen.queryByText('the join screen')).not.toBeInTheDocument();
  });

  it('is unbothered by a QR that is not a URL at all', async () => {
    fakeCamera('granted');
    decode.mockReturnValue({ data: 'BEGIN:VCARD\nFN:A Salon\nEND:VCARD' });
    serve();
    open();

    expect(await screen.findByText(/not a salon code/)).toBeInTheDocument();
  });
});

describe('when the camera cannot be opened', () => {
  beforeEach(() => {
    fakeVideoAndCanvas();
    fakeAnimationFrames();
  });

  it('explains a refused permission, and offers the way that still works', async () => {
    fakeCamera('denied');
    serve();
    open();

    expect(await screen.findByText('The camera is switched off')).toBeInTheDocument();
    // The phone's own camera app reads the same code, so this is an
    // inconvenience rather than a wall — and the copy says so.
    expect(screen.getByText(/phone’s own camera app/)).toBeInTheDocument();
  });

  it('explains a browser that has no camera at all', async () => {
    fakeCamera('unsupported');
    serve();
    open();

    expect(await screen.findByText('This browser cannot open the camera')).toBeInTheDocument();
  });

  it('shows no viewfinder when the camera was refused', async () => {
    fakeCamera('denied');
    serve();
    open();

    await screen.findByText('The camera is switched off');
    expect(screen.queryByLabelText(/looking for a salon/)).not.toBeInTheDocument();
  });
});

describe('leaving without scanning', () => {
  it('stops the camera and joins nothing', async () => {
    fakeVideoAndCanvas();
    fakeAnimationFrames();
    const { tracks } = fakeCamera('granted');
    serve();
    const view = open();

    await waitFor(() => expect(tracks[0].stop).not.toHaveBeenCalled());
    view.unmount();

    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
    expect(sent).toHaveLength(0);
    expect(store().tenants).toEqual([]);
  });
});
