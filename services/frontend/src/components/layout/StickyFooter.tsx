import type { ReactNode } from 'react';

interface StickyFooterProps {
  children: ReactNode;
  /** Optional line above the buttons, e.g. a running total. */
  meta?: ReactNode;
}

/** Pins the primary action to the bottom of a screen. */
export function StickyFooter({ children, meta }: StickyFooterProps) {
  return (
    <div className="sticky-footer">
      {meta ? <div className="footer-meta">{meta}</div> : null}
      {children}
    </div>
  );
}

/** Two buttons side by side inside a StickyFooter. */
export function FooterRow({ children }: { children: ReactNode }) {
  return <div className="sticky-footer-row">{children}</div>;
}
