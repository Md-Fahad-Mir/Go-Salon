/* Which "add to home screen" offer, if any, this browser can make.

   Pure, and fed the device rather than reading it, so the rules can be tested
   against real user-agent strings instead of whatever jsdom reports.

   Two browsers matter, because a salon's QR code is scanned by a phone:

     Android   Chrome (and the Chromium browsers that follow it) fires
               `beforeinstallprompt`, and the app can show the real install
               dialog on a tap. No event, no offer: that is how Chrome says it
               is already installed, or that this browser cannot install.
     iOS       There is no such event in any iOS browser, ever. Safari installs
               through Share → Add to Home Screen, so the offer is the
               instruction. Other iOS browsers — Chrome, Firefox, the in-app
               browsers of Instagram, Facebook and Google — are left alone:
               their menus differ, and the in-app ones cannot install at all.

   Desktop gets nothing, deliberately; see `InstallBanner`. */

export interface Device {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** Everything on iOS is WebKit and says "Safari"; the browsers that are not
    Safari add a token of their own, and these are the ones that do. */
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Instagram|FBAN|FBAV|Line\/|Snapchat/;

export const isIos = ({ userAgent, platform = '', maxTouchPoints = 0 }: Device): boolean =>
  /iPad|iPhone|iPod/.test(userAgent) ||
  // iPadOS 13 onwards asks for the desktop site, so it reports itself as a
  // Mac. A Mac has no touch screen; that is the tell.
  (platform === 'MacIntel' && maxTouchPoints > 1);

export const isIosSafari = (device: Device): boolean =>
  isIos(device) && /Safari\//.test(device.userAgent) && !NOT_SAFARI.test(device.userAgent);

export const isAndroid = ({ userAgent }: Device): boolean => /Android/i.test(userAgent);

/** Already running as the installed app — from the home screen, not a tab.
    `display-mode` for everything that implements it, and iOS's own
    `navigator.standalone`, which is the only signal older Safari gives. */
export function isStandalone(win: Window = window): boolean {
  const byMedia =
    typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  return byMedia || (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const currentDevice = (): Device => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
});

/** `/join/<token>` — what a salon's QR code opens. */
const JOIN = /^\/join\/[^/]+\/?$/;

/** The join journey: the screen a code opens, and — while that join is waiting
    on a sign-in — the auth screens in between. `pendingRedirect` is how the
    app already remembers the code across those hops, so it is also how this
    knows the person on the sign-in screen came from one. After the join,
    Home is the app proper, and the offer stops. */
export const inJoinJourney = (pathname: string, pendingRedirect: string | null): boolean =>
  JOIN.test(pathname) ||
  (pathname.startsWith('/auth/') && pendingRedirect !== null && JOIN.test(pendingRedirect));
