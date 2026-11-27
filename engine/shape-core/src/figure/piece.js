/*
  A Piece is one mesh of a figure, and where it is right now. The body is a piece,
  and so is each limb (see shape/skeleton.js).

  It stands on the base of its parent, then bends, which is its own base, and then comes
  its fitting. The bend is in between, so a stretched piece bends without being slanted.
  It starts at its rest, and a pose is added to that.

  A bend means the same on both sides of a flipped limb: "20 outward" in a pose is
  turned around for what is inside of a flip.
*/

import { Transform } from "../space/transform.js";
import { Turn } from "../space/turn.js";
import { add } from "../space/vector.js";

const STILL = { turn: [0, 0, 0], move: [0, 0, 0] };

export class Piece {
  #mesh = null;
  #lump = null;

  constructor(shape) {
    this.shape = shape;
    this.parent = null;
    this.chain = [];
    this.at = "";
    this.stance = new Transform();
    this.fitting = new Transform();
    this.movement = null;
    this.rest = STILL;
    this.flipped = false;
    this.base = new Transform();
    this.world = new Transform();
  }

  static ofLimb(limb, parent) {
    const placement = limb.chain.at(-1);
    const { shape, lumped } = placement;
    const piece = new Piece(shape);

    if (lumped) piece.#lump = () => placement.lump(limb.fitting);

    piece.parent = parent;
    piece.chain = limb.chain;
    piece.at = limb.at;
    piece.stance = limb.stance;
    piece.fitting = lumped ? new Transform() : limb.fitting;
    piece.movement = limb.movement;
    piece.rest = limb.rest ?? STILL;
    piece.flipped = parent.flipped !== limb.stance.flipped;

    return piece;
  }

  get mesh() {
    this.#mesh ??= this.#lump ? this.#lump() : this.shape.mesh;

    return this.#mesh;
  }

  get path() {
    return this.chain.map(placement => placement.id);
  }

  get name() {
    return this.movement?.name ?? "";
  }

  materialOf(slot) {
    return this.chain.reduceRight((material, placement) => placement.materialOf(material), slot);
  }

  bend(bends) {
    const stand = this.parent ? this.parent.base.times(this.stance) : this.stance;

    if (!this.movement) {
      this.base = stand;
      this.world = stand.times(this.fitting);

      return;
    }

    const side = this.flipped ? -1 : 1;
    const bend = bends.get(this.name) ?? STILL;
    const turn = this.movement.turned(add(this.rest.turn, bend.turn));
    const move = this.movement.moved(add(this.rest.move, bend.move));

    const degrees = Turn.degrees([turn[0], turn[1] * side, turn[2] * side]);
    const motion = Transform.at([move[0] * side, move[1], move[2]], degrees);

    this.base = stand.times(motion);
    this.world = this.base.times(this.fitting);
  }

  shift(distance) {
    this.base = raised(this.base, distance);
    this.world = raised(this.world, distance);
  }

  lowest() {
    return Math.min(...this.mesh.outline.map(point => this.world.point(point)[2]));
  }
}

function raised({ axes, origin: [x, y, z] }, distance) {
  return new Transform(axes, [x, y, z + distance]);
}
