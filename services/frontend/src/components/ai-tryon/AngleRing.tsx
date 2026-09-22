import { Check } from 'lucide-react';
import { ANGLES } from '../../utils/angles';
import type { HeadAngle } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';

interface AngleRingProps {
  captured: HeadAngle[];
  current: HeadAngle;
  onPick?: (angle: HeadAngle) => void;
}

/** Where the customer is around their own head.

    A ring rather than a progress bar, because the thing being tracked is a
    rotation: eight marks at their real bearings, the front at the top, filling
    in as they go. It is the whole instruction — "you are here, that is what is
    left" — without a sentence of copy. */
export function AngleRing({ captured, current, onPick }: AngleRingProps) {
  const t = useT();
  const done = new Set(captured);
  const radius = 42;

  return (
    <div className="tryon-ring">
      <svg viewBox="-60 -60 120 120" className="tryon-ring-svg" aria-hidden="true">
        <circle cx="0" cy="0" r={radius} className="tryon-ring-track" />
        {ANGLES.map((angle) => {
          /* Bearing 0 is the front and sits at the top, so the circle reads the
             way the customer is standing rather than the way maths counts. */
          const radians = ((angle.bearing - 90) * Math.PI) / 180;
          const x = Math.cos(radians) * radius;
          const y = Math.sin(radians) * radius;
          const state = done.has(angle.id) ? 'done' : angle.id === current ? 'active' : 'pending';
          return (
            <g key={angle.id} transform={`translate(${x} ${y})`} data-state={state}>
              <circle r={state === 'active' ? 8 : 6} className="tryon-ring-dot" />
              {state === 'done' ? (
                <path d="M-3 0 L-1 2.2 L3 -2.2" className="tryon-ring-tick" />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="tryon-ring-count">
        <strong>{t('tryon.angleProgress', {
          done: formatNumber(captured.length),
          total: formatNumber(ANGLES.length),
        })}</strong>
      </div>

      {/* The same eight as buttons: a ring is readable but not reachable, and
          a customer who wants to redo the back should not have to walk the
          whole circle again to get there. */}
      <ul className="tryon-ring-list">
        {ANGLES.map((angle) => {
          const state = done.has(angle.id) ? 'done' : angle.id === current ? 'active' : 'pending';
          return (
            <li key={angle.id}>
              <button
                type="button"
                className="tryon-ring-chip"
                data-state={state}
                aria-current={angle.id === current ? 'step' : undefined}
                onClick={onPick ? () => onPick(angle.id) : undefined}
                disabled={!onPick}
              >
                {state === 'done' ? <Check size={12} aria-hidden="true" /> : null}
                {t(angle.label)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
