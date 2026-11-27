/*
  A Rig is the pieces of a shape and how they stand on each other. It needs no
  triangles, so it is quick to make.

  Posed is whether it starts in the pose of the shape, or as it was built. Shapes in
  it keep their own poses either way.

  A placement or a spot of the shape can be found: the piece which carries it, the
  ground its position is measured from, and its world, the place itself at its size.
*/

import { Piece } from "./piece.js";

const UNBENT = new Map();

export class Rig {
  #made = new Map();

  constructor(shape, posed = true) {
    this.skeleton = shape.skeleton;
    this.pieces = [];

    this.#grow(shape, posed ? shape.poses[shape.pose]?.joints ?? {} : {});
    this.bend(UNBENT);
  }

  get decals() {
    return this.skeleton.decals.map(mark => ({ ...mark, piece: this.#made.get(mark.owner), world: this.#made.get(mark.owner).base.times(mark.transform) }));
  }

  get sockets() {
    return this.skeleton.sockets.map(open => ({
      name: open.name,
      path: [open.path, open.socket.name].filter(Boolean).join("/"),
      accepts: open.socket.accepts,
      piece: this.#made.get(open.owner),
      place: this.#base(open)
    }));
  }

  bend(bends) {
    for (const piece of this.pieces) piece.bend(bends);
  }

  find(thing) {
    const place = this.skeleton.places.get(thing);
    const piece = place && this.#made.get(place.owner);

    if (!piece) return null;

    return { piece, ground: piece.base.times(place.ground), world: piece.base.times(place.transform) };
  }

  ground(at) {
    const open = this.skeleton.find(at);

    return open && this.#made.has(open.owner) ? this.#base(open) : null;
  }

  #base({ owner, stance }) {
    return this.#made.get(owner).base.times(stance);
  }

  #grow(shape, joints) {
    this.#add(null, new Piece(shape));

    for (const limb of this.skeleton.limbs) {
      const rest = joints[limb.movement?.name] ?? limb.rest;

      this.#add(limb, Piece.ofLimb({ ...limb, rest }, this.#made.get(limb.parent)));
    }
  }

  #add(owner, piece) {
    this.#made.set(owner, piece);
    this.pieces.push(piece);
  }
}
