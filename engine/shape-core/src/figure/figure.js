/*
  A Figure is a shape standing somewhere, in a pose and in its colors. Many figures
  can be made of one shape, and they share its meshes.

  A pose is added to how it stands by itself. It can be placed somewhere, which shows
  with the next pose.

  Its spotlights are the glows of the pose, worked out for drawing: which surfaces
  light up, in what color, and the box they shine from.

  A glow is on a joint, on a placement by its id, or on a socket, which means what is
  attached there.

  How its pieces stand on each other is its rig.

  One glow can light up several places, such as both hands. Each is a spotlight,
  and there are never more than LIMIT.
*/

import { channels, isColor, isStandard, Material, standard } from "../paint/material.js";
import { Palette } from "../paint/palette.js";
import { Bounds } from "../space/bounds.js";
import { add, scale } from "../space/vector.js";
import { Pose } from "./pose.js";
import { Rig } from "./rig.js";

const LIMIT = 8;

export class Figure {
  #owners = new Map();
  #standards = new Map();
  #boxes = new Map();
  #paint;

  constructor(shape, paint = {}, posed = true) {
    this.shape = shape;
    this.palette = new Palette();
    this.spotlights = [];
    this.repaints = 0;

    this.#paint = paint;
    this.#know(shape);
    this.#findStandards(shape);
    this.rig = new Rig(shape, posed);

    for (const piece of this.pieces) piece.row = this.palette.reserve(piece.mesh.slots.map(slot => piece.materialOf(slot)));

    this.take(new Pose());
  }

  get decals() {
    return this.rig.decals;
  }

  get sockets() {
    return this.rig.sockets;
  }

  get pieces() {
    return this.rig.pieces;
  }

  get bounds() {
    const points = this.pieces.flatMap(piece => piece.mesh.outline.map(point => piece.world.point(point)));

    return Bounds.around(points);
  }

  find(thing) {
    return this.rig.find(thing);
  }

  take(pose) {
    this.rig.bend(pose.bends);

    this.spotlights = [...pose.glows].flatMap(([target, glow]) => this.#shine(target, glow)).slice(0, LIMIT);
  }

  place(transform) {
    this.pieces[0].stance = transform;
  }

  land(height = 0, stands = () => true) {
    const lowest = Math.min(...this.pieces.filter(stands).map(piece => piece.lowest()));

    if (!Number.isFinite(lowest)) return;

    const rise = height - lowest;

    for (const piece of this.pieces) piece.shift(rise);
    for (const light of this.spotlights) light.middle = add(light.middle, [0, 0, rise]);
  }

  paint(materials) {
    this.#paint = materials;
    this.#boxes.clear();
    this.repaints++;
  }

  material(name) {
    if (isStandard(name)) return standard(name, { ...this.#standards.get(name), ...this.#paint[name] });

    const [owner, own] = name.includes(":") ? name.split(":") : ["", name];
    const shape = this.#owners.get(owner) ?? this.shape;

    return new Material({ ...shape.materials[own], ...this.#paint[name] });
  }

  #know(shape) {
    for (const placement of shape.parts) {
      this.#owners.set(placement.shape.id, placement.shape);
      this.#know(placement.shape);
    }
  }

  #findStandards(top) {
    let level = [top];

    while (level.length) {
      for (const [name, json] of level.flatMap(shape => Object.entries(shape.materials))) {
        if (isStandard(name) && !this.#standards.has(name)) this.#standards.set(name, json);
      }

      level = level.flatMap(shape => shape.parts.map(placement => placement.shape));
    }
  }

  #shine(target, glow) {
    const color = this.#blend(glow.colors);
    const attached = this.pieces.filter(piece => piece.at === target).map(piece => piece.path.at(-1));
    const wanted = [target, ...attached];

    return this.pieces.flatMap((piece, index) => {
      const whole = piece.name === target || wanted.some(id => piece.path.includes(id));
      const runs = runsOf(piece.mesh.surfaces, surface => whole || wanted.some(id => surface.path.includes(id)));

      return runs.flatMap(run => this.#spotlight(piece, index, run, glow, color));
    });
  }

  #spotlight(piece, index, { first, last }, glow, color) {
    const box = this.#box(piece, index, first, last, glow.bright);

    if (box.empty) return [];

    const { world } = piece;
    const half = box.half.map((size, axis) => size * world.lengths[axis]);

    return [{
      piece: index, first, last, color,
      bright: glow.bright,
      strength: glow.strength,
      reach: glow.reach,
      middle: world.point(box.middle),
      turn: world.turn,
      half
    }];
  }

  #box(piece, index, first, last, bright) {
    const key = [index, first, last, bright].join();

    if (this.#boxes.has(key)) return this.#boxes.get(key);

    const { surfaces } = piece.mesh;
    const inside = owner => owner >= first && owner <= last;
    const shining = owner => this.material(piece.materialOf(surfaces[owner].material)).bright;

    const points = piece.mesh.points(owner => inside(owner) && (!bright || shining(owner)));
    const box = Bounds.around(points);

    this.#boxes.set(key, box);

    return box;
  }

  #blend(colors) {
    const parts = colors.map(({ color, share }) => {
      const hex = isColor(color) ? color : this.material(color).colors[0];

      return scale(channels(hex), share / 255);
    });

    return parts.reduce(add, [0, 0, 0]);
  }
}

function runsOf(surfaces, wanted) {
  const runs = [];

  surfaces.forEach((surface, index) => {
    if (!wanted(surface)) return;

    const run = runs.at(-1);

    if (run?.last === index - 1) run.last = index;
    else runs.push({ first: index, last: index });
  });

  return runs;
}
