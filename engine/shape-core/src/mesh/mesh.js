/*
  A Mesh is finished triangles, ready to draw. It is never changed once made.

  The numbers are kept flat, since that is what the graphics card takes:
    positions  three numbers for each corner
    normals    three numbers for each corner
    owners     which surface each corner belongs to
    indices    three corners for each triangle

  Slots are its materials, each once. Surfaces name the slot they use, and what
  a slot looks like is up to whoever draws the mesh.

  The outline is the few points which stick out the furthest, enough to find
  the lowest point of a mesh in any pose without going through all of it.
*/

import { Bounds } from "../space/bounds.js";
import { MeshBuilder } from "./builder.js";
import { decode, encode } from "./file.js";

const STEPS = [-2, -1, 0, 1, 2];

const DIRECTIONS = STEPS.flatMap(x => STEPS.flatMap(y => STEPS.map(z => [x, y, z])))
  .filter(direction => direction.some(n => Math.abs(n) === 2));

export class Mesh {
  #bounds;
  #outline;
  #slots;

  constructor({ positions, normals, owners, indices, surfaces, stamp = "" }) {
    this.positions = positions;
    this.normals = normals;
    this.owners = owners;
    this.indices = indices;
    this.surfaces = surfaces;
    this.stamp = stamp;
  }

  static fromSolids(solids) {
    const builder = new MeshBuilder();

    for (const solid of solids) builder.addSolid(solid);

    return new Mesh(builder.finish());
  }

  static fromBytes(bytes) {
    return new Mesh(decode(bytes));
  }

  get bytes() {
    return encode(this);
  }

  get corners() {
    return this.owners.length;
  }

  get bounds() {
    this.#bounds ??= Bounds.around(this.points());

    return this.#bounds;
  }

  get slots() {
    this.#slots ??= [...new Set(this.surfaces.map(surface => surface.material))];

    return this.#slots;
  }

  get outline() {
    this.#outline ??= outermost([...this.points()]);

    return this.#outline;
  }

  point(corner) {
    const start = corner * 3;

    return [this.positions[start], this.positions[start + 1], this.positions[start + 2]];
  }

  normal(corner) {
    const start = corner * 3;

    return [this.normals[start], this.normals[start + 1], this.normals[start + 2]];
  }

  *points(wanted = () => true) {
    for (let corner = 0; corner < this.corners; corner++) {
      if (wanted(this.owners[corner])) yield this.point(corner);
    }
  }
}

function outermost(points) {
  if (!points.length) return [];

  const furthest = DIRECTIONS.map(direction => {
    let best = points[0];
    let reach = -Infinity;

    for (const point of points) {
      const here = point[0] * direction[0] + point[1] * direction[1] + point[2] * direction[2];

      if (here <= reach) continue;

      best = point;
      reach = here;
    }

    return best;
  });

  return [...new Set(furthest)];
}
