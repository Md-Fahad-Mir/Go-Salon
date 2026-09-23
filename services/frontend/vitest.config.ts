/* Test config, kept apart from vite.config.ts on purpose.

   These tests exercise store and client logic, not components, so they need
   neither the React plugin nor the build and server blocks — and keeping the
   two files separate means nothing here can reach a production build. Vitest
   prefers this file when it is present. */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No DOM. The only browser API these tests touch is localStorage, which
    // `src/test/setup.ts` stubs in a dozen lines — cheaper than pulling in
    // jsdom for it. F2's switcher is the first thing that will genuinely need
    // a DOM, and it should bring jsdom and @testing-library/react together.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // `apiClient.ts` reads this at module load and would throw without it.
    env: { VITE_API_BASE_URL: 'http://api.test/api' },
    // Every `vi.fn()` is forgotten between tests, so one test cannot arrange
    // the next one's network.
    restoreMocks: true,
    unstubGlobals: true,
  },
});
