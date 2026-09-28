/* The rules that decide which install offer a browser gets, against real
   user-agent strings. */

import { describe, expect, it } from 'vitest';
import { UA } from '../test/install';
import { inJoinJourney, isAndroid, isIos, isIosSafari, isStandalone } from './installPlatform';

describe('telling the browsers apart', () => {
  it('knows Chrome on Android', () => {
    expect(isAndroid({ userAgent: UA.android })).toBe(true);
    expect(isAndroid({ userAgent: UA.desktopChrome })).toBe(false);
  });

  it('knows Safari on an iPhone, and nothing else on one', () => {
    expect(isIosSafari({ userAgent: UA.iosSafari })).toBe(true);
    // All three are iOS and all three say "Safari"; only one is.
    expect(isIos({ userAgent: UA.iosChrome })).toBe(true);
    expect(isIosSafari({ userAgent: UA.iosChrome })).toBe(false);
    expect(isIosSafari({ userAgent: UA.iosInstagram })).toBe(false);
  });

  it('knows an iPad that asks for the desktop site, by its touch screen', () => {
    const ipad = { userAgent: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 5 };
    expect(isIosSafari(ipad)).toBe(true);
    // The same string on a real Mac, which has no touch screen, is desktop.
    expect(isIosSafari({ ...ipad, maxTouchPoints: 0 })).toBe(false);
  });
});

describe('already installed', () => {
  const win = (displayStandalone: boolean, standalone?: boolean) =>
    ({
      matchMedia: (query: string) => ({ matches: displayStandalone && query.includes('standalone') }),
      navigator: { standalone },
    }) as unknown as Window;

  it('is read from display-mode, and from iOS’s own flag', () => {
    expect(isStandalone(win(true))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
    expect(isStandalone(win(false, false))).toBe(false);
  });

  it('is not, in a browser with no matchMedia at all', () => {
    expect(isStandalone({ navigator: {} } as unknown as Window)).toBe(false);
  });
});

describe('the join journey', () => {
  const CODE = '/join/ZrQCx_6iG3XSsjqaRn_PBPnfz4OiePxtI3CuObmuYcI';

  it('is the screen a code opens', () => {
    expect(inJoinJourney(CODE, null)).toBe(true);
  });

  it('is the sign-in screens only while a code is waiting on them', () => {
    expect(inJoinJourney('/auth/login', CODE)).toBe(true);
    expect(inJoinJourney('/auth/register/customer', CODE)).toBe(true);
    expect(inJoinJourney('/auth/login', null)).toBe(false);
    expect(inJoinJourney('/auth/login', '/bookings')).toBe(false);
  });

  it('is nothing else in the app', () => {
    for (const path of ['/home', '/bookings', '/profile', '/profile/settings', '/join-salon', '/ai-tryon']) {
      expect(inJoinJourney(path, CODE)).toBe(false);
    }
  });
});
