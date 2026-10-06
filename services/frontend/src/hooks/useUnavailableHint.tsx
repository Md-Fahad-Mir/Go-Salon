/* "Why can't I pick that?" — the bubble over a calendar day or a time slot
   that is not on offer.

   A greyed-out button says *no* and nothing else. These stay pressable —
   `aria-disabled` rather than `disabled`, because a disabled button gets no
   click in any browser and no pointer events in some — so hovering one, or
   tapping it on a phone, can say *why*: the salon is closed that day, the hour
   is already booked, it is too soon to get there.

   With a mouse the bubble follows the cursor in and out. A tap has no cursor
   to leave, so it holds for a moment and then goes by itself, or as soon as
   something else is touched. Either way it leaves through its own animation
   rather than vanishing. */

import { Ban } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';

/** Between the arrow's tip and the thing it points at. */
const GAP = 10;
/** Closest the bubble may sit to either side of its host. */
const EDGE = 4;
/** Keeps the arrow off the bubble's rounded corners. */
const ARROW_INSET = 14;
/** Room the sticky header takes; any less above the target and the bubble
    opens underneath it instead. */
const SAFE_TOP = 72;
/** How long a tapped hint stays up — there is no cursor to take it away. */
const TAP_HOLD_MS = 2600;
/** Outlasts `.unavail-hint[data-leaving]` in ui.css, so the exit plays out. */
const LEAVE_MS = 160;

interface Hint {
  key: string;
  message: string;
  leaving: boolean;
}

export interface UnavailableProps {
  'aria-disabled': true;
  'aria-describedby'?: string;
  'data-unavailable': 'true';
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  onBlur: () => void;
}

/** A small sideways shake: the button heard you, and the answer is no. */
const nudge = (element: HTMLElement) => {
  if (typeof element.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 320, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
  );
};

/** `hostRef` goes on the positioned element the bubble is drawn inside (give
    it `unavail-host`), `bind(key, why)` is spread onto each unavailable
    button, and `node` is rendered once inside the host. Destructure the
    result: the React Compiler treats an object that holds a ref as a ref, and
    refuses `hint.node` during render. */
export function useUnavailableHint() {
  const id = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  /** The key under the mouse, if any — a hovered hint needs no timer. */
  const hovered = useRef<string | null>(null);
  const timers = useRef<{ hold?: number; leave?: number }>({});

  const [hint, setHint] = useState<Hint | null>(null);
  /** What the live region last said. Only set on a press, so sweeping the
      mouse across a closed week is not read out day by day. */
  const [announced, setAnnounced] = useState('');

  const hide = useCallback(() => {
    window.clearTimeout(timers.current.hold);
    window.clearTimeout(timers.current.leave);
    setHint((current) => (current && !current.leaving ? { ...current, leaving: true } : current));
    timers.current.leave = window.setTimeout(() => setHint(null), LEAVE_MS);
  }, []);

  const show = useCallback(
    (target: HTMLElement, key: string, message: string, hold: boolean) => {
      window.clearTimeout(timers.current.hold);
      window.clearTimeout(timers.current.leave);
      targetRef.current = target;
      setHint((current) =>
        current && current.key === key && current.message === message && !current.leaving
          ? current
          : { key, message, leaving: false },
      );
      if (hold) timers.current.hold = window.setTimeout(hide, TAP_HOLD_MS);
    },
    [hide],
  );

  /* Placed after it renders and before it paints, because centring it, keeping
     it inside the host and choosing above or below all need its real size. */
  useLayoutEffect(() => {
    const host = hostRef.current;
    const bubble = bubbleRef.current;
    const target = targetRef.current;
    if (!hint || !host || !bubble || !target) return;

    const box = host.getBoundingClientRect();
    const at = target.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;

    const centre = at.left - box.left + at.width / 2;
    const left = Math.min(Math.max(centre - width / 2, EDGE), Math.max(EDGE, box.width - width - EDGE));
    const arrow = Math.min(Math.max(centre - left, ARROW_INSET), width - ARROW_INSET);
    const below = at.top - height - GAP < SAFE_TOP;

    bubble.style.left = `${left}px`;
    bubble.style.top = below ? `${at.bottom - box.top + GAP}px` : `${at.top - box.top - height - GAP}px`;
    bubble.style.setProperty('--arrow-x', `${arrow}px`);
    bubble.dataset.side = below ? 'bottom' : 'top';
  }, [hint]);

  /* A tap anywhere that is not another unavailable option puts it away —
     otherwise picking a good day would leave the last "no" hanging over it. */
  useEffect(() => {
    if (!hint || hint.leaving) return;
    const away = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-unavailable]')) return;
      hide();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [hint, hide]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      window.clearTimeout(pending.hold);
      window.clearTimeout(pending.leave);
    };
  }, []);

  const bind = (key: string, message: string): UnavailableProps => ({
    'aria-disabled': true,
    'aria-describedby': hint?.key === key && !hint.leaving ? id : undefined,
    'data-unavailable': 'true',
    onPointerEnter: (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered.current = key;
      show(event.currentTarget, key, message, false);
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered.current = null;
      hide();
    },
    onBlur: () => {
      if (hovered.current !== key) hide();
    },
    onClick: (event) => {
      nudge(event.currentTarget);
      setAnnounced(message);
      show(event.currentTarget, key, message, hovered.current !== key);
    },
  });

  const node: ReactNode = (
    <>
      <span className="sr-only" role="status" aria-live="polite">{announced}</span>
      {hint ? (
        <div
          key={hint.key}
          ref={bubbleRef}
          id={id}
          role="tooltip"
          className="unavail-hint"
          data-leaving={hint.leaving ? 'true' : undefined}
        >
          <span className="unavail-hint-icon" aria-hidden="true">
            <Ban size={12} strokeWidth={2.5} />
          </span>
          <span>{hint.message}</span>
        </div>
      ) : null}
    </>
  );

  return { hostRef, bind, node };
}
