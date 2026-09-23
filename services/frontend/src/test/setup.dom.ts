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
