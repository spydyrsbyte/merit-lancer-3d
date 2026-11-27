/*
  A Spot is a place in a shape: a socket, a plug, or insignia. With "at" it is on a
  side or a socket of something in the shape, as a placement can be, and follows it.
*/

import { path, text, vector } from "../input/clean.js";
import { Transform } from "../space/transform.js";
import { Turn } from "../space/turn.js";

const CENTER = [0, 0, 0];

export class Spot {
  constructor(json) {
    this.name = text(json.name, "");
    this.at = path(json.at);
    this.position = vector(json.position, CENTER);
    this.rotation = vector(json.rotation, CENTER);
  }

  get turn() {
    return Turn.degrees(this.rotation);
  }

  get stance() {
    return Transform.at(this.position, this.turn);
  }

  get spot() {
    const { name, at, position, rotation } = this;

    return at ? { name, at, position, rotation } : { name, position, rotation };
  }
}
