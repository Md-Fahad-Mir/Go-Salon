/* The install offer, for jsdom, which has none of it.

   The same approach as `camera.ts`, and kept beside it for the same reason:
   the next thing that needs one of these should not invent a second.

   Four gaps are filled. jsdom never fires `beforeinstallprompt` or
   `appinstalled` — they are dispatched here as plain Events carrying the two
   members Chrome adds. It has no `matchMedia`. And its `navigator` is one
   desktop-ish identity; a device is set by shadowing `userAgent`, `platform`,
   `maxTouchPoints` and `standalone` with own properties on the real object —
   not by replacing `navigator`, which would take `language` and everything
   else with it — and `restoreDevice` deletes them again. */

import { vi } from 'vitest';
import type { BeforeInstallPromptEvent } from '../store/useInstallStore';

/** Real user-agent strings, one per case the banner distinguishes. */
export const UA = {
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.0.0 Mobile/15E148 Safari/604.1',
  iosInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
  /** iPadOS asks for the desktop site and reports itself as a Mac. */
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
} as const;

const SHADOWED = ['userAgent', 'platform', 'maxTouchPoints', 'standalone'] as const;

interface DeviceOptions {
  platform?: string;
  maxTouchPoints?: number;
  /** iOS's own "running from the home screen" flag. */
  standalone?: boolean;
  /** `(display-mode: standalone)` — every other browser's. */
  displayStandalone?: boolean;
}

export function fakeDevice(userAgent: string, options: DeviceOptions = {}): void {
  const values = {
    userAgent,
    platform: options.platform ?? '',
    maxTouchPoints: options.maxTouchPoints ?? 0,
    standalone: options.standalone,
  };
  for (const key of SHADOWED) {
    Object.defineProperty(navigator, key, { value: values[key], configurable: true });
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: Boolean(options.displayStandalone) && query.includes('display-mode: standalone'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

export function restoreDevice(): void {
  for (const key of SHADOWED) delete (navigator as unknown as Record<string, unknown>)[key];
}

/** Chrome offering the install. `outcome` is what the person will answer in
    the browser's own dialog. */
export function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(async () => {});
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome, platform: 'web' }) },
  });
  window.dispatchEvent(event);
  return { event, prompt };
}

/** The browser saying the app is now installed — by our button or its menu. */
export const fireInstalled = (): void => void window.dispatchEvent(new Event('appinstalled'));
