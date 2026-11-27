/*
  The shapes the engine already knows. Each fills a box of 1 x 1 x 1 around the
  middle, and is convex. Round ones stand upright.

  They answer the same questions as a shape someone built (see shape/shape.js), and
  are placed, sized and painted the same way. Their one material is primary.

  They are elastic: placed at 40 x 10 x 5, a box is that large, but its pattern is not
  pulled along. Nobody made them, so they are not in the count of what is in a shape.
*/

import { Mesh } from "../mesh/mesh.js";
import { Surface } from "../mesh/surface.js";
import { distance, scale, unit } from "../space/vector.js";
import { Face } from "./face.js";
import { Solid } from "./solid.js";

const SEGMENTS = 24;
const CIRCLE = Math.PI * 2;
const TOUCHING = 1e-9;

const NO_SKELETON = { body: [], cuts: [], limbs: [], sockets: [], lost: [], idle: [], places: new Map() };

class Builtin {
  #solids;
  #mesh;

  constructor(id) {
    this.id = id;
    this.name = id;
    this.builtin = true;
    this.elastic = true;
    this.parts = [];
    this.keywords = [];
    this.limbs = [];
    this.joints = [];
    this.sockets = [];
    this.plugs = [];
    this.insignia = [];
    this.materials = {};
    this.pose = "";
    this.poses = {};
    this.warnings = [];
    this.skeleton = NO_SKELETON;
    this.everything = new Set();
  }

  get solids() {
    this.#solids ??= [new Solid(this.faces(), new Surface({ material: "primary" }))];

    return this.#solids;
  }

  get mesh() {
    this.#mesh ??= Mesh.fromSolids(this.solids);

    return this.#mesh;
  }

  get stamp() {
    return this.id;
  }

  contains() {
    return false;
  }
}

class Prism extends Builtin {
  #bottom;
  #top;

  constructor(id, bottom, top) {
    super(id);

    this.#bottom = bottom;
    this.#top = top;
  }

  faces() {
    const bottom = this.#bottom;
    const top = this.#top;

    const sides = bottom.map((corner, i) => {
      const next = (i + 1) % bottom.length;

      return [corner, bottom[next], top[next], top[i]];
    });

    const outlines = [...sides, bottom.toReversed(), top].map(distinct);

    return outlines.filter(outline => outline.length > 2).map(outline => Face.flat(outline));
  }
}

class Round extends Builtin {
  #radius;

  constructor(id, radius) {
    super(id);

    this.#radius = radius;
  }

  faces() {
    const rim = Array.from({ length: SEGMENTS }, (_, i) => this.#spoke(i));
    const bottom = Face.flat(rim.map(spoke => spoke.low).reverse());

    const sides = rim.map((here, i) => {
      const next = rim[(i + 1) % SEGMENTS];

      return this.#side(here, next);
    });

    if (!this.#radius) return [...sides, bottom];

    const top = Face.flat(rim.map(spoke => spoke.high));

    return [...sides, bottom, top];
  }

  #side(here, next) {
    const points = [here.low, next.low, next.high, here.high];
    const normals = [here.normal, next.normal, next.normal, here.normal];

    if (this.#radius) return Face.flat(points, normals);

    return Face.flat(points.slice(0, 3), normals.slice(0, 3));
  }

  #spoke(index) {
    const angle = index / SEGMENTS * CIRCLE;
    const x = Math.cos(angle);
    const y = Math.sin(angle);

    return {
      low: [x / 2, y / 2, -0.5],
      high: [x * this.#radius, y * this.#radius, 0.5],
      normal: unit([x, y, 0.5 - this.#radius])
    };
  }
}

class Sphere extends Builtin {
  faces() {
    const rings = SEGMENTS / 2;
    const faces = [];

    for (let ring = 0; ring < rings; ring++) {
      for (let step = 0; step < SEGMENTS; step++) faces.push(this.#face(ring, step));
    }

    return faces;
  }

  #face(ring, step) {
    const normals = distinct([
      this.#normal(ring, step),
      this.#normal(ring, step + 1),
      this.#normal(ring + 1, step + 1),
      this.#normal(ring + 1, step)
    ]);

    return Face.flat(normals.map(normal => scale(normal, 0.5)), normals);
  }

  #normal(ring, step) {
    const rise = ring / SEGMENTS * CIRCLE;
    const around = step / SEGMENTS * CIRCLE;

    return [Math.sin(rise) * Math.cos(around), Math.sin(rise) * Math.sin(around), -Math.cos(rise)];
  }
}

function distinct(points) {
  return points.filter((point, i) => !points.slice(0, i).some(other => distance(point, other) < TOUCHING));
}

function rectangle(x, back, front, z) {
  return [[-x, back, z], [x, back, z], [x, front, z], [-x, front, z]];
}

function hexagon(z) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = i / 6 * CIRCLE;

    return [Math.cos(angle) / 2, Math.sin(angle) / Math.sqrt(3), z];
  });
}

const base = rectangle(0.5, -0.5, 0.5, -0.5);

const list = [
  new Prism("box", base, rectangle(0.5, -0.5, 0.5, 0.5)),
  new Prism("wedge", base, rectangle(0.5, -0.5, -0.5, 0.5)),
  new Prism("taper", base, rectangle(0.3, -0.3, 0.3, 0.5)),
  new Prism("hex", hexagon(-0.5), hexagon(0.5)),
  new Round("cylinder", 0.5),
  new Round("cone", 0),
  new Sphere("sphere")
];

export const BUILTINS = new Map(list.map(shape => [shape.id, shape]));

export const PLACEHOLDER = BUILTINS.get("box");
