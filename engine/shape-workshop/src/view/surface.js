/*
  The Surface under the pointer, as a place to attach to: the side which looks that
  way, and where on it. What is put there is not turned, except for things which point
  somewhere: a socket points away from what it is on, a plug into it, and insignia face
  away.
*/

import { OPPOSITE, SIDES } from "../../../shape-core/src/index.js";

const STILL = [0, 0, 0];
const DIGITS = 100;

const OUTWARD = {
  top: [0, 0, 0], bottom: [180, 0, 0],
  right: [0, 90, 0], left: [0, -90, 0],
  front: [-90, 0, 0], back: [90, 0, 0]
};

const FACING = {
  front: [0, 0, 0], back: [0, 0, 180],
  right: [0, 0, -90], left: [0, 0, 90],
  top: [90, 0, 0], bottom: [-90, 0, 0]
};

export function surfaceAt(draft, view, at, step = 0) {
  const hit = view.pick(at);

  if (!hit) return null;

  const inside = hit.path.join("/");
  const center = draft.rig.ground(`${inside}/center`);

  if (!center) return null;

  const side = sideToward(center.turn.inverse.apply(hit.normal));
  const place = `${inside}/${side}`;
  const across = SIDES[side].findIndex(number => number !== 0);
  const local = draft.rig.ground(place).inverse.point(hit.point);

  return { at: place, side, position: local.map((number, axis) => axis === across ? tidy(number) : snapped(number, step)) };
}

export function rotationOn(kind, side) {
  if (kind === "insignia") return [...FACING[side]];
  if (kind === "socket") return [...OUTWARD[side]];
  if (kind === "plug") return [...OUTWARD[OPPOSITE[side]]];

  return [...STILL];
}

export function tidy(number) {
  return Math.round(number * DIGITS) / DIGITS || 0;
}

export function snapped(number, step) {
  return step ? Math.round(number / step) * step || 0 : tidy(number);
}

function sideToward(normal) {
  const strength = side => SIDES[side].reduce((sum, number, axis) => sum + number * normal[axis], 0);
  const [best] = Object.keys(OUTWARD).sort((a, b) => strength(b) - strength(a));

  return best;
}
