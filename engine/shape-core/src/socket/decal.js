/*
  A DecalPlace is a place with a name where a picture can go. Forward points away from
  what it is on, and the picture can be turned on it.
*/

import { number, vector } from "../input/clean.js";
import { Spot } from "./spot.js";

const USUAL = [10, 10, 10];
const SMALLEST = 0.01;

export class DecalPlace extends Spot {
  constructor(json) {
    super(json);

    this.size = vector(json.size, USUAL, SMALLEST);
    this.spin = number(json.turn, 0);
    this.art = json.art ? structuredClone(json.art) : null;
    this.opacity = number(json.opacity, 1, 0.05, 1);
    this.wear = number(json.wear, 0, 0, 1);
    this.glow = json.glow === true;
    this.values = structuredClone(json.values ?? {});
  }

  toJSON() {
    return { ...this.spot, size: this.size, turn: this.spin, art: this.art, opacity: this.opacity, wear: this.wear, glow: this.glow, values: this.values };
  }
}
