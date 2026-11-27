/*
  A Pose is how far each joint is bent from the start, by the name of the joint:
    { "knee-left": { "turn": [-40, 0, 0], "move": [0, 0, 0] } }

  Glows are what shines while it is held (see glow.js), by what they are on: a
  joint, a socket, or the id of a placement.

  Whoever plays animations makes a pose for each moment.
*/

import { record, vector } from "../input/clean.js";
import { add, mix } from "../space/vector.js";
import { Glow } from "./glow.js";

const STILL = [0, 0, 0];

export class Pose {
  constructor(bends = new Map(), glows = new Map()) {
    this.bends = bends;
    this.glows = glows;
  }

  static read(joints, glows = {}) {
    const bends = Object.entries(record(joints)).map(([joint, bend]) => [joint, {
      turn: vector(bend?.turn, STILL),
      move: vector(bend?.move, STILL)
    }]);

    const shining = Object.entries(record(glows)).map(([target, glow]) => [target, Glow.read(glow)]);

    return new Pose(new Map(bends), new Map(shining.filter(([, glow]) => glow.strength > 0)));
  }

  plus(other) {
    const bends = this.#combined(other, add);
    const glows = new Map([...this.glows, ...other.glows]);

    return new Pose(bends, glows);
  }

  toward(other, amount) {
    const bends = this.#combined(other, (a, b) => mix(a, b, amount));
    const targets = new Set([...this.glows.keys(), ...other.glows.keys()]);

    const glows = [...targets].map(target => {
      const from = this.glows.get(target) ?? other.glows.get(target).off;
      const to = other.glows.get(target) ?? this.glows.get(target).off;

      return [target, from.toward(to, amount)];
    });

    return new Pose(bends, new Map(glows));
  }

  #combined(other, combine) {
    const names = new Set([...this.bends.keys(), ...other.bends.keys()]);

    return new Map([...names].map(name => {
      const mine = this.bends.get(name);
      const theirs = other.bends.get(name);

      return [name, {
        turn: combine(mine?.turn ?? STILL, theirs?.turn ?? STILL),
        move: combine(mine?.move ?? STILL, theirs?.move ?? STILL)
      }];
    }));
  }
}
