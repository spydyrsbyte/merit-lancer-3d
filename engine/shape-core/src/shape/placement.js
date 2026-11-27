/*
  A Placement is one use of a shape inside of another: which shape, where, which
  way around and how large. The same shape can be placed any number of times.

  With "at" it is attached to a socket, and its position and rotation start there.
  Without, they start in the middle of the shape it is in. See skeleton.js.

  The size is how many times as large it is, in each direction. A built-in shape is
  1 unit, so for those it is the size in units. A shape with limbs cannot be stretched
  one way, since its bent limbs would come out slanted. It gets the largest of its
  three sizes all around.

  Its name is for people. Its keywords are added to those of the shape.

  Paint swaps materials of the placed shape for ones of the shape it is in. A
  material which the placed shape brought itself becomes "id:name", so it is not
  mistaken for one with the same name somewhere else.

  Grain is how its pattern lies: turned by an angle, zoomed, and mirrored.

  The lump is the placed shape as a mesh of its own, at its full size. A box on a joint
  needs one, since its pattern would be stretched if a box of 1 x 1 x 1 were drawn
  larger instead, and so does anything with a grain.
*/

import { uuid } from "../file/uuid.js";
import { number, path, record, text, vector, words } from "../input/clean.js";
import { MeshBuilder } from "../mesh/builder.js";
import { Mesh } from "../mesh/mesh.js";
import { isStandard } from "../paint/material.js";
import { BUILTINS, PLACEHOLDER } from "../solid/builtin.js";
import { Transform } from "../space/transform.js";
import { Turn } from "../space/turn.js";

const CENTER = [0, 0, 0];
const SAME = [1, 1, 1];
const SMALLEST = 0.01;

export class Placement {
  constructor(json) {
    const grain = record(json.grain);

    this.id = text(json.id, "") || uuid();
    this.use = text(json.use, "box");
    this.revision = number(json.revision, 0);
    this.name = text(json.name, "");
    this.keywords = words(json.keywords);

    this.at = path(json.at);
    this.plug = text(json.plug, "");
    this.position = vector(json.position, CENTER);
    this.rotation = vector(json.rotation, CENTER);
    this.size = vector(json.size, SAME, SMALLEST);
    this.flip = json.flip === true;
    this.pose = text(json.pose, "");

    this.cut = json.cut === true;
    this.hidden = json.hidden === true;

    this.paint = { ...record(json.paint) };
    this.grain = { angle: number(grain.angle, 0), zoom: number(grain.zoom, 1, 0.01), mirror: grain.mirror === true };

    this.shape = BUILTINS.get(this.use) ?? PLACEHOLDER;
  }

  get key() {
    return this.revision ? `${this.use}@${this.revision}` : this.use;
  }

  get stretched() {
    const [x, y, z] = this.size;

    if (x === y && y === z) return false;

    return this.shape.limbs.length > 0;
  }

  get lumped() {
    const { angle, zoom, mirror } = this.grain;

    return this.shape.elastic || angle !== 0 || zoom !== 1 || mirror;
  }

  get stance() {
    return Transform.at(this.position, Turn.degrees(this.rotation));
  }

  sizing(flip) {
    const even = Math.max(...this.size);
    const [x, y, z] = this.stretched ? [even, even, even] : this.size;

    return Transform.sized([flip ? -x : x, y, z]);
  }

  solids(transform) {
    return this.shape.solids?.map(solid => solid.moved(transform, this.adopt(solid.surface, transform))) ?? null;
  }

  lump(transform) {
    const builder = new MeshBuilder();

    builder.addMesh(this.shape.mesh, transform, surface => surface.placed(transform, this.#pattern(surface, transform)));

    return new Mesh(builder.finish());
  }

  materialOf(slot) {
    const { shape } = this;

    if (Object.hasOwn(this.paint, slot)) return this.paint[slot];
    if (isStandard(slot) || !Object.hasOwn(shape.materials, slot)) return slot;

    return `${shape.id}:${slot}`;
  }

  adopt(surface, transform) {
    const material = this.materialOf(surface.material);
    const path = [this.id, ...surface.path];

    return surface.placed(transform, { material, path, ...this.#pattern(surface, transform) });
  }

  toJSON() {
    const { id, use, name, position, rotation, size, paint, grain } = this;
    const json = { id, use, name, position, rotation, size };

    if (this.keywords.length) json.keywords = this.keywords;
    if (this.revision) json.revision = this.revision;
    if (this.at) json.at = this.at;
    if (this.plug) json.plug = this.plug;
    if (this.pose) json.pose = this.pose;
    if (this.flip) json.flip = true;
    if (this.cut) json.cut = true;
    if (this.hidden) json.hidden = true;
    if (Object.keys(paint).length) json.paint = paint;
    if (grain.angle || grain.mirror || grain.zoom !== 1) json.grain = grain;

    return json;
  }

  #pattern(surface, transform) {
    const { angle, zoom, mirror } = this.grain;
    const growth = this.shape.elastic ? 1 : transform.size;

    return { angle: surface.angle + angle, zoom: surface.zoom * zoom * growth, mirror };
  }
}
