/*
  A Face is one flat side of a solid. Its points run counter-clockwise when
  seen from outside, and each has a normal for shading.

  Its plane is the direction it faces and how far along that direction it is.
*/

import { cross, dot, mix, negate, subtract, unit } from "../space/vector.js";

const EPSILON = 1e-5;

export class Face {
  constructor(points, normals, plane) {
    this.points = points;
    this.normals = normals;
    this.plane = plane;
  }

  static flat(points, normals) {
    const [a, b, c] = points;
    const direction = unit(cross(subtract(b, a), subtract(c, a)));

    return new Face(points, normals ?? points.map(() => direction), planeOf(direction, a));
  }

  get flipped() {
    const { direction, reach } = this.plane;
    const plane = { direction: negate(direction), reach: -reach };

    return new Face(this.points.toReversed(), this.normals.map(negate).reverse(), plane);
  }

  moved(transform) {
    const points = this.points.map(p => transform.point(p));
    const normals = this.normals.map(n => transform.normal(n));
    const plane = planeOf(transform.normal(this.plane.direction), points[0]);

    if (transform.flipped) return new Face(points.reverse(), normals.reverse(), plane);

    return new Face(points, normals, plane);
  }

  heights(plane) {
    return this.points.map(p => dot(p, plane.direction) - plane.reach);
  }

  split(heights) {
    const front = new Face([], [], this.plane);
    const back = new Face([], [], this.plane);

    for (let i = 0; i < this.points.length; i++) {
      const next = (i + 1) % this.points.length;
      const here = heights[i];
      const there = heights[next];

      if (here >= -EPSILON) front.#add(this.points[i], this.normals[i]);
      if (here <= EPSILON) back.#add(this.points[i], this.normals[i]);

      if (!crosses(here, there)) continue;

      const amount = here / (here - there);
      const point = mix(this.points[i], this.points[next], amount);
      const normal = mix(this.normals[i], this.normals[next], amount);

      front.#add(point, normal);
      back.#add(point, normal);
    }

    return { front, back };
  }

  #add(point, normal) {
    this.points.push(point);
    this.normals.push(normal);
  }
}

function planeOf(direction, point) {
  return { direction, reach: dot(direction, point) };
}

function crosses(here, there) {
  if (here > EPSILON) return there < -EPSILON;
  if (here < -EPSILON) return there > EPSILON;

  return false;
}
