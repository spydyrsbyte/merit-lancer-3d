/*
  A Socket is where something can be attached to a shape, and a Plug is where a
  shape is held. Attaching puts the plug on the socket. A gun in a hand is the same
  as an arm on a body.

  Up of a socket points out of its shape, and up of a plug into its shape, so they
  are put arrow on arrow and nobody has to work out an angle. To release a plug is
  to move its shape, at a size, until the plug is in the middle and faces up.

  What a socket accepts and what a plug fits are only words. Nothing is enforced.
  No words mean anything.

  A socket which has a movement bends. One which flips has what is attached to it
  mirrored, so one arm fits on both sides.

  What is put on a side instead of a socket is not turned (see sides.js).
*/

import { words } from "../input/clean.js";
import { Transform } from "../space/transform.js";
import { Movement } from "./movement.js";
import { Spot } from "./spot.js";

export class Socket extends Spot {
  constructor(json) {
    super(json);

    this.accepts = words(json.accepts);
    this.movement = Movement.read(json.movement);
    this.flip = json.flip === true;
  }

  toJSON() {
    const json = { ...this.spot, accepts: this.accepts, movement: this.movement ?? {} };

    if (this.flip) json.flip = true;

    return json;
  }
}

export class Plug extends Spot {
  constructor(json) {
    super(json);

    this.fits = words(json.fits);
  }

  release(sizing) {
    const { origin, turn } = sizing.times(this.stance);
    const back = turn.inverse;
    const [x, y, z] = back.apply(origin);

    return Transform.at([-x, -y, -z], back);
  }

  fitsIn(socket) {
    if (!this.fits.length || !socket.accepts.length) return true;

    return this.fits.some(word => socket.accepts.includes(word));
  }

  toJSON() {
    return { ...this.spot, fits: this.fits };
  }
}

export const CENTER_PLUG = new Plug({ name: "center" });
