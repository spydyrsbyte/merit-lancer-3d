/*
  A Glow lights up a shape for a while, and shines on what is around it.
    strength  how much, where 0 is off and 1 is full
    reach     how far it shines, in units
    colors    what color, each with its share, since one color may be on its way
              to another and they can be names which only the figure knows
    bright    whether only the Bright surfaces of the shape light up
*/

import { number, record, text } from "../input/clean.js";

export class Glow {
  constructor(colors, strength, reach, bright) {
    this.colors = colors;
    this.strength = strength;
    this.reach = reach;
    this.bright = bright;
  }

  static read(json) {
    const given = record(json);
    const colors = [{ color: text(given.color, "lights"), share: 1 }];

    return new Glow(colors, number(given.strength, 1, 0, 4), number(given.reach, 10, 0, 1000), given.only === "bright");
  }

  get off() {
    return new Glow(this.colors, 0, this.reach, this.bright);
  }

  toward(other, amount) {
    const colors = [...shared(this.colors, 1 - amount), ...shared(other.colors, amount)];
    const strength = blend(this.strength, other.strength, amount);
    const reach = blend(this.reach, other.reach, amount);

    return new Glow(colors, strength, reach, this.bright);
  }
}

function shared(colors, amount) {
  return colors.map(({ color, share }) => ({ color, share: share * amount }));
}

function blend(from, to, amount) {
  return from + (to - from) * amount;
}
