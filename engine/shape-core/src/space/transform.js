/*
  A Transform says where something is, which way it faces, and how large it is.

  It is kept as an origin and three axes: where a step to the right, forward and
  up end up. A transform inside of another is their product: outer.times(inner).

  Flipped means it swaps left and right, as a mirror does. No turn can do that.

  Rigid is the same place and turn without the size, and not flipped.

  Normals are special. Under a stretch, a surface tilts one way and its normal
  the other, so they go through the cross products of the axes.
*/

import { Turn } from "./turn.js";
import { add, cross, dot, length, negate, scale, subtract, unit } from "./vector.js";

const RIGHT = [1, 0, 0];
const FORWARD = [0, 1, 0];
const UP = [0, 0, 1];

export class Transform {
  constructor(axes = [RIGHT, FORWARD, UP], origin = [0, 0, 0]) {
    this.axes = axes;
    this.origin = origin;
  }

  static at(origin, turn = new Turn()) {
    return new Transform([turn.apply(RIGHT), turn.apply(FORWARD), turn.apply(UP)], origin);
  }

  static sized([x, y, z]) {
    return new Transform([scale(RIGHT, x), scale(FORWARD, y), scale(UP, z)]);
  }

  get volume() {
    const [right, forward, up] = this.axes;

    return dot(right, cross(forward, up));
  }

  get flipped() {
    return this.volume < 0;
  }

  get size() {
    return Math.cbrt(Math.abs(this.volume));
  }

  get lengths() {
    return this.axes.map(length);
  }

  get turn() {
    const [, forward, up] = this.axes;

    const ahead = unit(forward);
    const above = unit(subtract(up, scale(ahead, dot(up, ahead))));

    return Turn.fromAxes(cross(ahead, above), ahead, above);
  }

  get normalAxes() {
    const [right, forward, up] = this.axes;
    const sides = [cross(forward, up), cross(up, right), cross(right, forward)];

    return this.flipped ? sides.map(negate) : sides;
  }

  get inverse() {
    const rows = this.normalAxes.map(axis => scale(axis, 1 / Math.abs(this.volume)));
    const axes = [0, 1, 2].map(column => rows.map(row => row[column]));
    const back = new Transform(axes);

    return new Transform(axes, negate(back.point(this.origin)));
  }

  get rigid() {
    return Transform.at(this.origin, this.turn);
  }

  times(inner) {
    return new Transform(inner.axes.map(axis => this.direction(axis)), this.point(inner.origin));
  }

  point(p) {
    return add(this.direction(p), this.origin);
  }

  direction(d) {
    return blend(this.axes, d);
  }

  normal(n) {
    return unit(blend(this.normalAxes, n));
  }
}

function blend([a, b, c], [x, y, z]) {
  return [
    a[0] * x + b[0] * y + c[0] * z,
    a[1] * x + b[1] * y + c[1] * z,
    a[2] * x + b[2] * y + c[2] * z
  ];
}
