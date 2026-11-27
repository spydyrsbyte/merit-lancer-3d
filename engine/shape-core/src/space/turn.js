/*
  A Turn is a rotation, kept as a quaternion.

  A quaternion is four numbers: an axis to turn around (x, y, z) and how far (w).
  It is used because turns can be chained with a few multiplications, never lose
  their shape, and fit in one slot on the graphics card.

  Degrees are applied around x, then y, then z.

  To get degrees back, the angle around y comes first. When it is straight up or down,
  x and z turn around the same line, and all of it is given to z.

  fromAxes starts from the largest of the four numbers, because dividing by a
  number close to zero would lose precision.
*/

import { add, cross, scale } from "./vector.js";

const RADIANS = Math.PI / 180;
const STRAIGHT = 0.9999999;

export class Turn {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  static degrees([x, y, z]) {
    const aroundX = Turn.around([1, 0, 0], x);
    const aroundY = Turn.around([0, 1, 0], y);
    const aroundZ = Turn.around([0, 0, 1], z);

    return aroundZ.times(aroundY).times(aroundX);
  }

  static around(axis, degrees) {
    const half = degrees * RADIANS / 2;
    const [x, y, z] = scale(axis, Math.sin(half));

    return new Turn(x, y, z, Math.cos(half));
  }

  static fromAxes([a, d, g], [b, e, h], [c, f, i]) {
    const squares = [1 + a - e - i, 1 - a + e - i, 1 - a - e + i, 1 + a + e + i];
    const largest = squares.indexOf(Math.max(...squares));

    const choices = [
      [squares[0], b + d, c + g, h - f],
      [b + d, squares[1], f + h, c - g],
      [c + g, f + h, squares[2], d - b],
      [h - f, c - g, d - b, squares[3]]
    ];

    const numbers = choices[largest];
    const size = Math.hypot(...numbers);

    return new Turn(...numbers.map(n => n / size));
  }

  get inverse() {
    return new Turn(-this.x, -this.y, -this.z, this.w);
  }

  get numbers() {
    return [this.x, this.y, this.z, this.w];
  }

  get degrees() {
    const { x, y, z, w } = this;
    const sine = Math.max(-1, Math.min(1, 2 * (w * y - x * z)));

    if (Math.abs(sine) > STRAIGHT) {
      const around = -2 * Math.atan2(x, w) * Math.sign(sine);

      return [0, 90 * Math.sign(sine), around / RADIANS];
    }

    const aroundX = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    const aroundZ = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));

    return [aroundX / RADIANS, Math.asin(sine) / RADIANS, aroundZ / RADIANS];
  }

  times(other) {
    const { x, y, z, w } = this;

    return new Turn(
      w * other.x + x * other.w + y * other.z - z * other.y,
      w * other.y - x * other.z + y * other.w + z * other.x,
      w * other.z + x * other.y - y * other.x + z * other.w,
      w * other.w - x * other.x - y * other.y - z * other.z
    );
  }

  apply(point) {
    const axis = [this.x, this.y, this.z];
    const side = add(cross(axis, point), scale(point, this.w));

    return add(point, scale(cross(axis, side), 2));
  }
}
