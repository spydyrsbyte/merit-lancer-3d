/*
  An Insignia is a place with a name where a picture can go. Forward points away from
  what it is on, and the picture can be turned on it.
*/

import { number, vector } from "../input/clean.js";
import { Spot } from "./spot.js";

const USUAL = [10, 10, 10];
const SMALLEST = 0.01;

export class Insignia extends Spot {
  constructor(json) {
    super(json);

    this.size = vector(json.size, USUAL, SMALLEST);
    this.spin = number(json.turn, 0);
  }

  toJSON() {
    return { ...this.spot, size: this.size, turn: this.spin };
  }
}
