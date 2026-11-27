/*
  A Solid is a convex lump (no dents) with other solids cut out of it.

  Because it is convex, a face is inside of it exactly when the face is behind
  all of its planes. Cutting clips a face by one plane after another. What is in
  front of any plane is outside, and what remains at the end is inside.

  The touch rules decide about faces lying exactly on each other:
    KEEP     the outside of the solid, gone where a cut is flush with it
    INSIDE   the walls of a cut, which are never on the outside of the solid
    EARLIER  against an earlier cut, a wall on a shared face is given up
    LATER    against a later cut, a wall on a shared face is kept
*/

import { Bounds } from "../space/bounds.js";
import { dot } from "../space/vector.js";

const EPSILON = 1e-5;

const KEEP = same => same;
const INSIDE = () => false;
const EARLIER = () => true;
const LATER = same => !same;

export class Solid {
  constructor(faces, surface, cuts = []) {
    this.faces = faces;
    this.surface = surface;
    this.cuts = cuts;
    this.bounds = Bounds.around(faces.flatMap(face => face.points));
  }

  get shell() {
    let outside = this.faces;

    for (const cut of this.cuts) outside = outside.flatMap(face => cut.sort(face, KEEP).outside);

    const walls = this.cuts.flatMap((cut, index) => this.#wallsOf(cut, index));

    return [...outside, ...walls];
  }

  moved(transform, surface = this.surface) {
    const faces = this.faces.map(face => face.moved(transform));
    const cuts = this.cuts.map(cut => cut.moved(transform));

    return new Solid(faces, surface, cuts);
  }

  cutBy(solids) {
    const touching = solids.filter(solid => solid.bounds.overlaps(this.bounds));

    return new Solid(this.faces, this.surface, [...this.cuts, ...touching]);
  }

  sort(face, rule) {
    const clipped = this.#clip(face, rule);

    if (!clipped.inside) return { inside: [], outside: [face] };

    const outside = clipped.outside;

    let inside = [clipped.inside];

    for (const cut of this.cuts) {
      const sorted = inside.map(part => cut.sort(part, rule));

      inside = sorted.flatMap(part => part.outside);
      outside.push(...sorted.flatMap(part => part.inside));
    }

    if (!inside.length) return { inside, outside: [face] };
    if (!outside.length) return { inside: [face], outside };

    return { inside, outside };
  }

  #wallsOf(cut, index) {
    const whole = new Solid(this.faces, this.surface);

    let walls = cut.shell.flatMap(face => whole.sort(face, INSIDE).inside);

    this.cuts.forEach((other, position) => {
      if (position === index) return;

      const rule = position < index ? EARLIER : LATER;

      walls = walls.flatMap(face => other.sort(face, rule).outside);
    });

    return walls.map(face => face.flipped);
  }

  #clip(face, rule) {
    const apart = { inside: null, outside: [face] };

    if (this.bounds.misses(face.points)) return apart;

    const outside = [];

    let rest = face;

    for (const { plane } of this.faces) {
      const heights = rest.heights(plane);
      const lowest = Math.min(...heights);
      const highest = Math.max(...heights);

      if (highest <= EPSILON && lowest < -EPSILON) continue;

      if (highest <= EPSILON) {
        const same = dot(face.plane.direction, plane.direction) > 0;

        if (rule(same)) continue;

        return apart;
      }

      if (lowest >= -EPSILON) return apart;

      const { front, back } = rest.split(heights);

      outside.push(front);
      rest = back;
    }

    return { inside: rest, outside };
  }
}
