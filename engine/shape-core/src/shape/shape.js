/*
  A Shape is shapes placed together. A foot, a leg, a gun, a mech and a truck are
  all shapes. What is in it is its recipe, and its finished triangles its mesh.

  A shape without a recipe is only a mesh, such as one made in Blender.

  Sockets are where others can be attached to it, and plugs where it is held. How
  its placements hang together is its skeleton.

  A pose is where each joint is at the start. The shape can have several, and
  starts in the one it names. A placement can choose another for its shape. When an
  animation goes to a pose, additive adds its values instead of going to them, and
  overlay is whether only the joints it names move. Not additive, and an overlay,
  is what a pose is unless it says otherwise.

  Keywords say what it is: "melee", "blade", "gms". Animations choose by them, and
  anything else may use them too, such as to sort. What they mean is up to
  the rules. A placement can add some.

  DecalPlace are places with a name where a picture can go.

  A placement marked as a cut is taken out of everything else in the body of the
  shape, and out of nothing outside of it. On a joint it cuts nothing. Once baked, the
  result is the shape and is not worked out again.

  Everything is the shape and all shapes in it, each once. AiParts is how many of
  those AI made. A box is not counted, as nobody made it.

  A shape which is created by code says AI made it, unless it is told otherwise.
  See file/author.js for what an AI has to do.

  The stamp changes whenever the mesh would come out differently, whether in this
  shape or in one melted into it. A mesh with another stamp is out of date.

  Files of version 1 are read as well (see upgrade.js).
*/

import { Heading } from "../file/heading.js";
import { list, record, text, vector, words } from "../input/clean.js";
import { MeshBuilder } from "../mesh/builder.js";
import { Mesh } from "../mesh/mesh.js";
import { PLACEHOLDER } from "../solid/builtin.js";
import { DecalPlace } from "../socket/decal.js";
import { Plug, Socket } from "../socket/socket.js";
import { Transform } from "../space/transform.js";
import { Placement } from "./placement.js";
import { Skeleton } from "./skeleton.js";
import { hash } from "./stamp.js";
import { upgraded } from "./upgrade.js";

const ENGINE = 3;
const VERSION = { major: 2, minor: 0 };
const NAMESPACES = ["lancer"];
const MISSING_SIZE = Transform.sized([10, 10, 10]);
const CENTER = [0, 0, 0];

export class Shape extends Heading {
  #mesh;

  constructor(given) {
    super(given, "Shape", VERSION);

    const json = upgraded(given, VERSION);

    this.placements = json.shapes ? records(json.shapes).map(entry => new Placement(entry)) : null;
    this.sockets = records(json.sockets).map(entry => new Socket(entry));
    this.plugs = records(json.plugs).map(entry => new Plug(entry));
    this.decals = records(json.decals ?? json.insignia).map(entry => new DecalPlace(entry));
    this.keywords = words(json.keywords);
    this.uri = String(record(json.data).uri ?? "");

    this.materials = record(json.materials);
    this.pose = text(json.pose, "");
    this.poses = readPoses(json.poses);
    this.animations = record(json.animations);
    this.meta = record(json.meta);
    this.source = null;
    this.elastic = false;
  }

  static create(json = {}) {
    return new Shape({ shapes: [], ...json, author: { ai: 1, ...json.author } });
  }

  get warnings() {
    const unknown = Object.keys(this.meta).filter(name => !NAMESPACES.includes(name));
    const stretched = this.parts.filter(placement => placement.stretched);
    const { lost, idle } = this.skeleton;

    return [
      ...this.headingWarnings,
      ...unknown.map(name => `${this.name}: meta.${name} is reserved`),
      ...stretched.map(({ shape }) => `${this.name}: ${shape.name} has limbs and cannot be stretched`),
      ...lost.map(({ at }) => `${this.name}: there is no socket ${at}`),
      ...idle.map(({ name, use }) => `${this.name}: ${name || use} is a cut on a joint, and cuts nothing`),
      ...this.pose && !this.poses[this.pose] ? [`${this.name}: there is no pose ${this.pose}`] : []
    ];
  }

  get parts() {
    return this.placements ?? [];
  }

  get skeleton() {
    return new Skeleton(this);
  }

  get limbs() {
    return this.skeleton.limbs;
  }

  get melted() {
    const { body, cuts } = this.skeleton;

    return [...body, ...cuts].map(({ placement }) => placement);
  }

  get joints() {
    return this.limbs.map(({ movement }) => movement?.name).filter(Boolean);
  }

  get stamp() {
    if (!this.placements) return `${this.id}@${this.revision}`;

    const { body, cuts } = this.skeleton;

    const recipe = [...body, ...cuts].map(({ placement, transform }) => {
      return [placement, transform, Object.keys(placement.shape.materials), placement.shape.stamp];
    });

    return hash(JSON.stringify([ENGINE, recipe]));
  }

  get mesh() {
    if (!this.placements) return this.#mesh ?? missingMesh();

    const stamp = this.stamp;

    if (this.#mesh?.stamp !== stamp) this.#mesh = this.#bake(stamp);

    return this.#mesh;
  }

  get solids() {
    if (!this.placements) return null;

    const { body, cuts } = this.skeleton;
    const cutters = solidsOf(cuts);

    return solidsOf(body).map(solid => solid.cutBy(cutters));
  }

  get everything() {
    const found = new Set([this]);

    for (const { shape } of this.parts) {
      for (const one of shape.everything) found.add(one);
    }

    return found;
  }

  get aiParts() {
    const all = [...this.everything];
    const made = all.filter(shape => shape.author.ai === 1);

    return { ai: made.length, total: all.length };
  }

  accept(mesh) {
    if (this.placements && mesh.stamp !== this.stamp) return false;

    this.#mesh = mesh;

    return true;
  }

  find(id) {
    return this.parts.find(placement => placement.id === id) ?? null;
  }

  add(json) {
    const placement = new Placement(json);

    this.placements ??= [];
    this.placements.push(placement);

    return placement;
  }

  remove(id) {
    this.placements = this.parts.filter(placement => placement.id !== id);
  }

  contains(id) {
    return this.parts.some(({ shape, use }) => use === id || shape.contains(id));
  }

  toJSON() {
    const { keywords, sockets, plugs, decals, materials, pose, poses, animations, meta } = this;
    const recipe = this.placements ? { shapes: this.placements } : {};

    return { ...this.heading, keywords, ...recipe, sockets, plugs, decals, data: { uri: this.uri }, materials, pose, poses, animations, meta };
  }

  #bake(stamp) {
    const builder = new MeshBuilder();
    const { body, cuts } = this.skeleton;
    const cutters = solidsOf(cuts);

    for (const { placement, transform } of body) {
      const solids = cutters.length ? placement.solids(transform) : null;
      const touched = solids?.some(solid => solid.cutBy(cutters).cuts.length > solid.cuts.length);

      if (touched) {
        for (const solid of solids) builder.addSolid(solid.cutBy(cutters));
      } else {
        builder.addMesh(placement.shape.mesh, transform, surface => placement.adopt(surface, transform));
      }
    }

    return new Mesh({ ...builder.finish(), stamp });
  }
}

function solidsOf(placed) {
  return placed.flatMap(({ placement, transform }) => placement.solids(transform) ?? []);
}

function records(value) {
  return list(value).map(record);
}

function readPoses(json) {
  const entries = Object.entries(record(json)).map(([slug, pose]) => {
    const { name, joints, additive, overlay } = record(pose);

    const bends = Object.entries(record(joints)).map(([joint, bend]) => [joint, {
      turn: vector(record(bend).turn, CENTER),
      move: vector(record(bend).move, CENTER)
    }]);

    const ways = { ...additive === true ? { additive: true } : {}, ...overlay === false ? { overlay: false } : {} };

    return [slug, { name: text(name, slug), ...ways, joints: Object.fromEntries(bends) }];
  });

  return Object.fromEntries(entries);
}

function missingMesh() {
  return Mesh.fromSolids(PLACEHOLDER.solids.map(solid => solid.moved(MISSING_SIZE)));
}
