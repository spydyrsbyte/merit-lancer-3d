/*
  Bounds are the straight box around some points.
*/

import { add, scale, subtract } from "./vector.js";

const EPSILON = 1e-5;

export class Bounds {
  constructor() {
    this.low = [Infinity, Infinity, Infinity];
    this.high = [-Infinity, -Infinity, -Infinity];
  }

  static around(points) {
    const bounds = new Bounds();

    for (const point of points) bounds.include(point);

    return bounds;
  }

  get empty() {
    return this.low[0] > this.high[0];
  }

  get middle() {
    return scale(add(this.low, this.high), 0.5);
  }

  get half() {
    return scale(subtract(this.high, this.low), 0.5);
  }

  get corners() {
    const ends = [this.low, this.high];

    return [0, 1, 2, 3, 4, 5, 6, 7].map(corner => [0, 1, 2].map(axis => ends[corner >> axis & 1][axis]));
  }

  include(point) {
    for (let axis = 0; axis < 3; axis++) {
      if (point[axis] < this.low[axis]) this.low[axis] = point[axis];
      if (point[axis] > this.high[axis]) this.high[axis] = point[axis];
    }
  }

  overlaps(other) {
    for (let axis = 0; axis < 3; axis++) {
      if (this.low[axis] >= other.high[axis]) return false;
      if (other.low[axis] >= this.high[axis]) return false;
    }

    return true;
  }

  misses(points) {
    for (let axis = 0; axis < 3; axis++) {
      const below = points.every(p => p[axis] <= this.low[axis] + EPSILON);
      const above = points.every(p => p[axis] >= this.high[axis] - EPSILON);

      if (below || above) return true;
    }

    return false;
  }
}
