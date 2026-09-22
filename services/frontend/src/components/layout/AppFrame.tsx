import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { OfflineBanner } from '../common/OfflineBanner';
import { Toaster } from '../common/Toaster';
import { useAppStore } from '../../store/useAppStore';

/** Marks the document with whose app this is, so `:root[data-app='customer']`
 *  and `:root[data-app='salon_owner']` rules apply to their screens and to
 *  nobody else's.
 *
 *  The attribute carries the role verbatim. Stamping all of them rather than
 *  only the two that have a stylesheet is deliberate: a barber and a salon
 *  employee match no rule either way, so their screens are unchanged, and the
 *  alternative — a role→scope lookup that returns undefined for two of four —
 *  is a second thing to keep in step with the CSS for no benefit.
 *
 *  It goes on `<html>`, not on the frame div, for two reasons:
 *
 *  - Modal and BottomSheet `createPortal` into `document.body`, so every
 *    dialog, sheet and action sheet in the app renders *outside* `.app-frame`.
 *    A scope hung on the frame would silently miss all of them. That matters
 *    most to the owner, whose whole app is sheet-driven: walk-ins, payments,
 *    reassignments, staff, services and hours all arrive through one.
 *  - Custom properties resolve at the nearest declaring ancestor. Declared on
 *    the frame, a scoped token block would win over `.dark-theme` on `<html>`
 *    and the night palette would quietly revert. On the same element as the
 *    theme class, the two compose.
 *
 *  All three gates matter. Without `isAuthenticated` the skin would reach the
 *  signed-out screens, which are shared by all four account types — `role`
 *  defaults to 'customer' when nobody is signed in. Without the `ready` check a
 *  provider reloading their own screen would be stamped for the length of the
 *  token round-trip. Failing unstamped shows the base design for a frame;
 *  failing stamped would show one role's styling on another's screen.
 */
function useAppScope(): string | undefined {
  const ready = useAppStore((state) => state.authStatus === 'ready');
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const role = useAppStore((state) => state.user?.role);

  const scope = ready && isAuthenticated ? role : undefined;

  useEffect(() => {
    const root = document.documentElement;
    if (scope) root.dataset.app = scope;
    else delete root.dataset.app;
    return () => { delete root.dataset.app; };
  }, [scope]);

  return scope;
}

/** The phone-width column every screen renders inside. */
export function AppFrame({ children }: { children: ReactNode }) {
  /* The attribute is deliberately NOT mirrored onto this div. Mirroring it
     makes `[data-app='…'] .sheet` look correct while silently missing every
     portalled sheet and dialog — the exact bug the <html> placement exists to
     prevent. One home for the scope, so a wrong selector fails visibly. */
  useAppScope();
  return (
    <div className="app-frame">
      <OfflineBanner />
      {children}
      <Toaster />
    </div>
  );
}
