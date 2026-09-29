/* Extra setup for the `dom` project only.

   Two things Testing Library would normally arrange for itself, and cannot
   here because this project imports its test helpers explicitly instead of
   setting `globals: true`: the jest-dom matchers, and unmounting what a test
   rendered. Without the cleanup every `render` leaves its container in
   `document.body`, and the next test's `getByRole` starts matching two
   elements and failing for a reason that has nothing to do with the code. */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

/* jsdom implements neither half of the object-URL pair, and a component that
   shows a fetched image cannot run without them. Counter-based rather than a
   fixed string so a test can tell one image from the next — which is exactly
   what "the new code replaced the old one on screen" has to assert. */
let objectUrls = 0;
const handedOut = new Set<string>();

URL.createObjectURL = () => {
  const url = `blob:gosalon/${++objectUrls}`;
  handedOut.add(url);
  return url;
};
URL.revokeObjectURL = (url: string) => void handedOut.delete(url);

/** Object URLs still outstanding — a test can check nothing was leaked. */
export const liveObjectUrls = (): number => handedOut.size;

/* jsdom has no `matchMedia`, and `ThemeProvider` asks it which mood the phone
   is in. A quiet default — nothing matches, nothing changes — so a screen can
   be mounted inside the provider the way the app mounts it. Tests about the
   install offer replace this with their own via `vi.stubGlobal`. */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
