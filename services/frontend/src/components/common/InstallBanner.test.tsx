/* The offer to add the app to the home screen, on the join journey.

   The banner, the store and the listener are the real ones; only the
   browser's side — its events, its identity, `matchMedia` — is faked, by
   `test/install.ts`. The banner is mounted outside the routes, the way
   `AppFrame` mounts it, so a navigation leaves the same instance in place. */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../LanguageProvider';
import { useAppStore } from '../../store/useAppStore';
import { dismissedThisSession, listenForInstall, useInstallStore } from '../../store/useInstallStore';
import { UA, fakeDevice, fireInstallPrompt, fireInstalled, restoreDevice } from '../../test/install';
import { InstallBanner } from './InstallBanner';

const CODE = '/join/ZrQCx_6iG3XSsjqaRn_PBPnfz4OiePxtI3CuObmuYcI';
const PRISTINE = useAppStore.getState();
let stop: () => void = () => {};

beforeEach(() => {
  useAppStore.setState(PRISTINE, true);
  sessionStorage.clear();
  useInstallStore.setState({ deferred: null, installed: false, dismissed: false });
  stop = listenForInstall();
});

afterEach(() => {
  stop();
  restoreDevice();
});

const open = (at: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[at]}>
        <InstallBanner />
        <Routes>
          <Route path="/join/:token" element={<Link to="/auth/login">sign in to join</Link>} />
          <Route path="/auth/login" element={<Link to={CODE}>signed in</Link>} />
          <Route path="*" element={<p>somewhere else</p>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

const banner = () => screen.queryByRole('complementary', { name: 'Get the Go Salon app' });

describe('Android: the browser offers the install', () => {
  beforeEach(() => fakeDevice(UA.android));

  it('says nothing until the browser has offered', () => {
    open(CODE);
    expect(banner()).not.toBeInTheDocument();
  });

  it('catches the offer, keeps the browser’s own infobar away, and shows the banner', () => {
    open(CODE);
    let fired!: ReturnType<typeof fireInstallPrompt>;
    act(() => {
      fired = fireInstallPrompt();
    });
    expect(fired.event.defaultPrevented).toBe(true);
    expect(banner()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });

  it('shows the real install dialog on a tap, and goes once it is installed', async () => {
    open(CODE);
    let fired!: ReturnType<typeof fireInstallPrompt>;
    act(() => {
      fired = fireInstallPrompt('accepted');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(fired.prompt).toHaveBeenCalledTimes(1);
    expect(banner()).not.toBeInTheDocument();
    act(() => fireInstalled());
    expect(useInstallStore.getState().installed).toBe(true);
    expect(banner()).not.toBeInTheDocument();
  });

  it('goes when the app is installed from the browser’s own menu instead', () => {
    open(CODE);
    act(() => void fireInstallPrompt());
    expect(banner()).toBeInTheDocument();

    act(() => fireInstalled());
    expect(banner()).not.toBeInTheDocument();
  });

  it('counts "cancel" in the browser’s dialog as "not now" — the offer is spent', async () => {
    open(CODE);
    act(() => void fireInstallPrompt('dismissed'));
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(banner()).not.toBeInTheDocument();
    expect(dismissedThisSession()).toBe(true);
  });

  it('stays through the whole journey: the code, sign-in, and back', async () => {
    open(CODE);
    act(() => void fireInstallPrompt());
    // JoinPage parks the code before sending somebody to sign in.
    act(() => useAppStore.getState().setPendingRedirect(CODE));

    await userEvent.click(screen.getByRole('link', { name: 'sign in to join' }));
    expect(banner()).toBeInTheDocument();

    // Sign-in spends the parked code and comes back to it.
    act(() => void useAppStore.getState().takePendingRedirect());
    await userEvent.click(screen.getByRole('link', { name: 'signed in' }));
    expect(banner()).toBeInTheDocument();
    // The held offer survived the trip and still works.
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });
});

describe('iOS: no event exists, so the offer is the instruction', () => {
  it('tells Safari’s users what to tap, with no install button', () => {
    fakeDevice(UA.iosSafari);
    open(CODE);
    expect(banner()).toBeInTheDocument();
    expect(banner()).toHaveTextContent('Tap Share, then Add to Home Screen.');
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('does the same on an iPad that reports itself as a Mac', () => {
    fakeDevice(UA.ipadDesktop, { platform: 'MacIntel', maxTouchPoints: 5 });
    open(CODE);
    expect(banner()).toBeInTheDocument();
  });

  it('stays quiet in Chrome and in in-app browsers on iOS', () => {
    for (const ua of [UA.iosChrome, UA.iosInstagram]) {
      fakeDevice(ua);
      const view = open(CODE);
      expect(banner()).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('already installed', () => {
  it('never shows when running from the home screen (display-mode)', () => {
    fakeDevice(UA.android, { displayStandalone: true });
    open(CODE);
    act(() => void fireInstallPrompt());
    expect(banner()).not.toBeInTheDocument();
  });

  it('never shows on iOS when navigator.standalone says so', () => {
    fakeDevice(UA.iosSafari, { standalone: true });
    open(CODE);
    expect(banner()).not.toBeInTheDocument();
  });
});

describe('a desktop', () => {
  it('is not offered the install, even though Chrome fires the event there too', () => {
    fakeDevice(UA.desktopChrome);
    open(CODE);
    act(() => void fireInstallPrompt());
    expect(banner()).not.toBeInTheDocument();
  });
});

describe('"Not now"', () => {
  beforeEach(() => fakeDevice(UA.iosSafari));

  it('hides it for the rest of the session', async () => {
    const first = open(CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(banner()).not.toBeInTheDocument();
    expect(dismissedThisSession()).toBe(true);

    // Another salon's code in the same session: still not shown.
    first.unmount();
    open('/join/another-salon-code-in-the-same-tab-aaaaaaaaaaaaaaa');
    expect(banner()).not.toBeInTheDocument();
  });

  it('does not outlive the session: a new one offers again', async () => {
    open(CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    // What a new tab or a new visit starts from: empty session storage, and
    // the store initialised from it.
    sessionStorage.clear();
    act(() => useInstallStore.setState({ dismissed: dismissedThisSession() }));
    expect(banner()).toBeInTheDocument();
  });
});

describe('only on the join journey', () => {
  beforeEach(() => fakeDevice(UA.android));

  for (const path of ['/home', '/bookings', '/profile', '/profile/settings', '/join-salon']) {
    it(`is not on ${path}, even with an offer in hand`, () => {
      open(path);
      act(() => void fireInstallPrompt());
      expect(banner()).not.toBeInTheDocument();
    });
  }

  it('is not on sign-in when no code is waiting on it', () => {
    open('/auth/login');
    act(() => void fireInstallPrompt());
    expect(banner()).not.toBeInTheDocument();
  });
});
