/*
  A Surface is the part of a mesh which looks the same all over: one material,
  and one way its pattern lies on it.

  A pattern is drawn in a space of its own, so it follows its shape. That space
  is an origin and a turn. If mirrored, its left and right are swapped, so the
  two sides of something symmetric match. Placing it with mirror swaps them again.

  The path is the ids of the placements it came through, outermost first. It is
  how a glow finds the barrel inside of a gun.
*/

import { Transform } from "../space/transform.js";
import { Turn } from "../space/turn.js";
import { subtract } from "../space/vector.js";

const BLANK = { material: "", path: [], origin: [0, 0, 0], turn: new Turn(), mirrored: false, angle: 0, zoom: 1 };

export class Surface {
  constructor(values = {}) {
    Object.assign(this, BLANK, values);
  }

  static fromJSON(json) {
    return new Surface({ ...json, turn: new Turn(...json.turn) });
  }

  toJSON() {
    return { ...this, turn: this.turn.numbers };
  }

  placed(transform, { mirror = false, ...changes } = {}) {
    const side = Transform.sized([this.mirrored ? -1 : 1, 1, 1]);
    const own = Transform.at(this.origin, this.turn).times(side);
    const space = transform.times(own);

    return new Surface({
      ...this,
      origin: space.origin,
      turn: space.turn,
      mirrored: space.flipped !== mirror,
      ...changes
    });
  }

  local(point) {
    const [x, y, z] = this.turn.inverse.apply(subtract(point, this.origin));

    return [this.mirrored ? -x : x, y, z];
  }
}
