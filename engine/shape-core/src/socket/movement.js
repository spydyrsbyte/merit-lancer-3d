/*
  A Movement is how a socket bends. Its name is the name of the joint, which poses
  and animations use. Joints with the same name move together.

  Turn is how far around each axis, in degrees, and move how far along it:
    { "name": "knee", "turn": { "x": [-110, 0] }, "move": { "z": "free" } }

  An axis which is not listed does not move, and "free" has no end. With no axes
  at all it does not bend, and is no joint.
*/

import { number, record, text } from "../input/clean.js";
import { within } from "../file/words.js";

const AXES = ["x", "y", "z"];
const NAME = /^[a-z][a-z0-9-]*$/;

export class Movement {
  constructor(name, turn, move) {
    this.name = name;
    this.turn = turn;
    this.move = move;
  }

  static read(json) {
    const given = record(json);
    const name = text(given.name, "");
    const turn = readAxes(given.turn);
    const move = readAxes(given.move);
    const bends = Object.keys(turn).length + Object.keys(move).length > 0;

    return bends && NAME.test(name) ? new Movement(name, turn, move) : null;
  }

  within(outer) {
    return new Movement(within(this.name, outer), this.turn, this.move);
  }

  turned(degrees) {
    return limited(this.turn, degrees);
  }

  moved(distance) {
    return limited(this.move, distance);
  }

  toJSON() {
    const { name, turn, move } = this;
    const json = { name };

    if (Object.keys(turn).length) json.turn = turn;
    if (Object.keys(move).length) json.move = move;

    return json;
  }
}

function readAxes(json) {
  const given = Object.entries(record(json)).filter(([axis]) => AXES.includes(axis));

  return Object.fromEntries(given.map(([axis, range]) => [axis, readRange(range)]));
}

function readRange(range) {
  if (!Array.isArray(range)) return "free";

  const ends = [number(range[0], 0), number(range[1], 0)];

  return [Math.min(...ends), Math.max(...ends)];
}

function limited(ranges, values) {
  return AXES.map((axis, i) => {
    const range = ranges[axis];

    if (!range) return 0;
    if (range === "free") return values[i];

    const low = Math.min(range[0], 0);
    const high = Math.max(range[1], 0);

    return Math.max(low, Math.min(high, values[i]));
  });
}
