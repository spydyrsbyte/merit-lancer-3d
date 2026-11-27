/*
  The Placer adds things by clicking where they go. It is armed with a tool, shows
  where it would land, and places it on a click.

  A tool is a kind of item, and for a shape which one. Where something lands is an
  "at", a position and a rotation:
    on a face     on the side of what was clicked which looks that way, so what is
                  placed touches it there and is not turned
    on the ground standing on it
    on an item    on top of a shape, or on a socket, when it is clicked in the list

  A side of a shape is that of its body. What has limbs is moved further out, until they
  do not stick into what it is put on.
*/

import { Bounds, BUILTINS, OPPOSITE, Rig, sidePoint, SIDES, Transform, Turn } from "../../../shape-core/src/index.js";
import { rotationOn, snapped, surfaceAt, tidy } from "./surface.js";

export const NEW_SIZE = [20, 20, 20];
const SAME = [1, 1, 1];
const STILL = [0, 0, 0];
const STEP = 1;
const BEND = { turn: { x: [-45, 45] } };
const DECAL_SIZE = [14, 4, 14];

export const BUILTIN_NAMES = {
  box: "Box", wedge: "Wedge", taper: "Taper", hex: "Hex block", cylinder: "Cylinder", cone: "Cone", sphere: "Sphere"
};

export class Placer {
  #session;
  #view;

  constructor(session, view) {
    this.#session = session;
    this.#view = view;
    this.tool = null;
    this.landing = null;
  }

  get ghost() {
    if (!this.landing) return null;

    const { at, position, rotation } = this.landing;
    const ground = at ? this.#draft.rig.ground(at) : new Transform();

    if (!ground) return null;

    const stance = ground.times(Transform.at(position, Turn.degrees(rotation)));

    if (this.tool.kind !== "shape") return { shape: null, place: stance };

    const { shape } = this.tool;
    const sizing = Transform.sized(sizeOf(shape));
    const [x, y, z] = at ? touchOf(at, shape, sizing) : STILL;

    return { shape, place: stance.times(Transform.at([-x, -y, -z])).times(sizing) };
  }

  arm(tool) {
    this.tool = tool;
    this.landing = null;
  }

  stop() {
    this.arm(null);
  }

  hover(at) {
    this.landing = this.#land(at);
  }

  leave() {
    this.landing = null;
  }

  place(landing) {
    const { kind } = this.tool;

    if (kind === "shape") return this.#placeShape(landing);
    if (kind === "joint") return this.#draft.add("socket", { name: kind, movement: { name: kind, ...structuredClone(BEND) }, ...landing });
    if (kind === "socket") return this.#draft.add("socket", { name: kind, movement: {}, ...landing });
    if (kind === "decals") return this.#draft.add("decals", { name: kind, size: [...DECAL_SIZE], turn: 0, ...landing });

    return this.#draft.add("plug", { name: kind, ...landing });
  }

  landOn({ id, kind, value }) {
    if (kind === "shape") return { at: `${id}/top`, position: this.#outward("top", STILL), rotation: rotationOn(this.tool.kind, "top") };
    if (kind !== "socket") return null;
    if (value.movement?.name && this.tool.kind !== "shape") return null;

    return { at: value.name, position: [...STILL], rotation: [...STILL] };
  }

  get #draft() {
    return this.#session.current;
  }

  #placeShape(landing) {
    const { shape } = this.tool;

    return this.#draft.add("shape", { use: shape.id, name: BUILTIN_NAMES[shape.id] ?? shape.name, size: sizeOf(shape), ...landing });
  }

  #land(at) {
    const surface = surfaceAt(this.#draft, this.#view, at, STEP);

    if (surface) return { at: surface.at, position: this.#outward(surface.side, surface.position), rotation: rotationOn(this.tool.kind, surface.side) };

    const [x, y] = this.#view.ground(at).map(number => snapped(number, STEP));
    const height = this.tool.kind === "shape" ? -extent(this.tool.shape, "bottom") : 0;

    return { position: [x, y, tidy(height)], rotation: rotationOn(this.tool.kind, "top") };
  }

  #outward(side, position) {
    if (this.tool.kind !== "shape") return [...position];

    return outward(this.tool.shape, side, position, sizeOf(this.tool.shape));
  }
}

function sizeOf(shape) {
  return BUILTINS.has(shape.id) ? [...NEW_SIZE] : [...SAME];
}

function touchOf(at, shape, sizing) {
  return sidePoint(OPPOSITE[at.split("/").at(-1)], shape, sizing);
}

export function outward(shape, side, position, size) {
  const touching = OPPOSITE[side];
  const axis = SIDES[side].findIndex(number => number !== 0);

  if (axis < 0) return [...position];

  const body = sidePoint(touching, shape, Transform.sized(size))[axis];

  return position.map((number, i) => i === axis ? tidy(number + body - extent(shape, touching, size)) : number);
}

function extent(shape, side, size = sizeOf(shape)) {
  const axis = SIDES[side].findIndex(number => number !== 0);
  const points = new Rig(shape).pieces.flatMap(piece => piece.mesh.outline.map(point => piece.world.point(point)));
  const { low, high, empty } = Bounds.around(points);

  if (empty) return 0;

  return (SIDES[side][axis] > 0 ? high : low)[axis] * size[axis];
}
