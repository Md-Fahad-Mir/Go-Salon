import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { BottomNavigation } from './BottomNavigation';

interface ScreenProps {
  children: ReactNode;
  /** Show the bottom tab bar and pad the content above it. */
  nav?: boolean;
  className?: string;
}

/** Full-height page wrapper. Pair with <Header> and <ScreenBody>. */
export function Screen({ children, nav = false, className }: ScreenProps) {
  return (
    <div className={cn('screen', className)} data-nav={nav ? 'true' : undefined}>
      {children}
      {nav ? <BottomNavigation /> : null}
    </div>
  );
}

interface ScreenBodyProps {
  children: ReactNode;
  /** Remove the standard padding (for edge-to-edge covers and lists). */
  flush?: boolean;
  className?: string;
}

/** Scrollable content area. Wrap a <form> inside when the screen submits. */
export function ScreenBody({ children, flush, className }: ScreenBodyProps) {
  return (
    <main className={cn('screen-body', className)} data-flush={flush ? 'true' : undefined}>
      {children}
    </main>
  );
}
