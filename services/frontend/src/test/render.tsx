/* Mounting a screen the way the app mounts it, minus what jsdom cannot do.

   `LanguageProvider` is required, not optional: every page calls `useT()` and
   throws without it. `ThemeProvider` is required too, now that Home's header
   carries the light/dark button; jsdom's missing `matchMedia` is stubbed in
   `setup.dom.ts` for it. */

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../components/LanguageProvider';
import { ThemeProvider } from '../components/ThemeProvider';

export interface MountOptions {
  /** The URL to start at, e.g. `/join/abc`. */
  at: string;
  /** Route patterns to render, e.g. `{ '/join/:token': <JoinPage /> }`. */
  routes: Record<string, ReactElement>;
  /** Rendered for anything the routes above do not match, so a test can prove
      *where* a redirect landed instead of only that it left. */
  elsewhere?: ReactElement;
}

export function mount({ at, routes, elsewhere }: MountOptions) {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            {Object.entries(routes).map(([path, element]) => (
              <Route key={path} path={path} element={element} />
            ))}
            {elsewhere ? <Route path="*" element={elsewhere} /> : null}
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </ThemeProvider>,
  );
}
