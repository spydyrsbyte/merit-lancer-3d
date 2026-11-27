/*
  Every shape has sides, whether it is a box or a mech: the six of the straight box
  around it, and its center. Something can be attached to a side without anybody
  having made a socket there.

  A side never turns anything. What is put on the right of a box touches it with its
  own left, and its up is still the up of the box.

  The center is the middle of the shape, where its positions are measured from.
*/

import { Bounds } from "../space/bounds.js";

export const SIDES = {
  center: [0, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  front: [0, 1, 0],
  back: [0, -1, 0]
};

export const OPPOSITE = {
  center: "center",
  top: "bottom",
  bottom: "top",
  right: "left",
  left: "right",
  front: "back",
  back: "front"
};

export const isSide = name => Object.hasOwn(SIDES, name);

export function sidePoint(name, shape, transform) {
  const direction = SIDES[name];
  const { bounds } = shape.mesh;

  if (name === "center" || bounds.empty) return transform.origin;

  const { middle, half } = Bounds.around(bounds.corners.map(corner => transform.point(corner)));

  return middle.map((number, axis) => number + half[axis] * direction[axis]);
}
