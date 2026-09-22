/* The eight views of one head, and what each of them is for.

   The ring is the order a customer is walked around: front, then anticlockwise
   to the left, behind, and back up the right side. Keeping one order in one
   place means the capture screen, the analysis, the render and the viewer all
   agree on what "back_left" means without passing labels between them.

   THE HONEST LIMIT: a phone's selfie camera cannot photograph the back of the
   head of the person holding it. So no angle except the front is required —
   the flow works with whatever was captured, and the back views are the ones a
   customer will usually take with the rear camera, a mirror, or a friend. */

import type { HeadAngle } from '../types';
import type { TKey } from '../i18n';

export interface AngleSpec {
  id: HeadAngle;
  /** Degrees clockwise from the front, for the ring indicator. */
  bearing: number;
  label: TKey;
  hint: TKey;
  /** A face should be visible here, so a frame without one is worth querying. */
  expectsFace: boolean;
  /** Reachable with the front camera while looking at the screen. */
  selfieReachable: boolean;
}

export const ANGLES: AngleSpec[] = [
  { id: 'front', bearing: 0, label: 'tryon.angleFront', hint: 'tryon.angleFrontHint', expectsFace: true, selfieReachable: true },
  { id: 'front_left', bearing: 45, label: 'tryon.angleFrontLeft', hint: 'tryon.angleTurnHint', expectsFace: true, selfieReachable: true },
  { id: 'left', bearing: 90, label: 'tryon.angleLeft', hint: 'tryon.angleProfileHint', expectsFace: true, selfieReachable: true },
  { id: 'back_left', bearing: 135, label: 'tryon.angleBackLeft', hint: 'tryon.angleBehindHint', expectsFace: false, selfieReachable: false },
  { id: 'back', bearing: 180, label: 'tryon.angleBack', hint: 'tryon.angleBackHint', expectsFace: false, selfieReachable: false },
  { id: 'back_right', bearing: 225, label: 'tryon.angleBackRight', hint: 'tryon.angleBehindHint', expectsFace: false, selfieReachable: false },
  { id: 'right', bearing: 270, label: 'tryon.angleRight', hint: 'tryon.angleProfileHint', expectsFace: true, selfieReachable: true },
  { id: 'front_right', bearing: 315, label: 'tryon.angleFrontRight', hint: 'tryon.angleTurnHint', expectsFace: true, selfieReachable: true },
];

export const angleSpec = (id: HeadAngle): AngleSpec =>
  ANGLES.find((angle) => angle.id === id) ?? ANGLES[0];

/** The one view nothing works without: it carries the face, and it is the
    render every other angle is matched against. */
export const REQUIRED_ANGLE: HeadAngle = 'front';

/** The views a preview is rendered for.

    Four, not eight. Every angle is a separate image-model call — eight would
    be twice the wait and twice the cost for a rotation the customer reads as
    four sides anyway. All eight still feed the *analysis*, which is one call
    however many photographs it carries. */
export const PREVIEW_ANGLES: HeadAngle[] = ['front', 'left', 'back', 'right'];

/** The ring, in capture order, keeping only what was actually captured. */
export const inRingOrder = <T extends { angle: HeadAngle }>(items: T[]): T[] => {
  const order = new Map(ANGLES.map((angle, index) => [angle.id, index]));
  return [...items].sort((a, b) => (order.get(a.angle) ?? 0) - (order.get(b.angle) ?? 0));
};
