/* Test config, kept apart from vite.config.ts on purpose: these tests need
   neither the build nor the server blocks, and keeping the two files separate
   means nothing here can reach a production build.

   TWO PROJECTS, not one environment for everything. The store and client
   suites are plain logic and run under `node`; only the component suites pay
   for a DOM. That split is the point — vitest imports jsdom lazily, per test
   file, so the node project's startup is untouched by the dom project's
   existence (measured: 51 tests in ~180ms either way, against ~780ms if
   everything ran under jsdom).

   `projects` and not `workspace`: the latter was removed in Vitest 4 and now
   throws at startup rather than warning. */

import { defineConfig } from 'vitest/config';

/** Shared by both projects, so they cannot drift on the things that matter. */
const common = {
  setupFiles: ['src/test/setup.ts'],
  // `apiClient.ts` reads this at module load and would throw without it.
  env: { VITE_API_BASE_URL: 'http://api.test/api' },
  // Every `vi.fn()` is forgotten between tests, so one test cannot arrange
  // the next one's network.
  restoreMocks: true,
  unstubGlobals: true,
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...common,
          name: 'unit',
          environment: 'node',
          // `.ts` only. A component test is a `.tsx` and belongs to the other
          // project; if one lands here it is simply not collected, which is
          // why the two globs are written to be mutually exclusive rather
          // than overlapping.
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          ...common,
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          // On top of the shared setup: jest-dom's matchers, and the
          // `afterEach(cleanup)` that Testing Library would normally register
          // itself but cannot here — it only does so when a global `afterEach`
          // exists, and this project imports its test helpers explicitly
          // rather than setting `globals: true`.
          setupFiles: ['src/test/setup.ts', 'src/test/setup.dom.ts'],
        },
      },
    ],
  },
});
