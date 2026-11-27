/*
  A Requirement is something an animation needs. It is always about a joint, as that
  is where things happen.

  The short way is "hip:02": two hips. Without a number it is at least one.

  The long way says what has to be on the joint, anywhere further out, and can give
  it a name for the steps to use:
    { "component": "shoulder", "name": "swordarm", "amount": 1,
      "has": [{ "joint": "elbow" }, { "shape": ["melee", "blade"], "amount": 2 }] }

  A shape is looked for by its keywords, and has to have all of those listed. All of
  "has" has to be there. An amount is exactly that many, or a minimum and a maximum.
  Without one it is at least one.

  If the anatomy is about one place, requirements with a name are about that too, as
  they are what the animation is done with. The others are about the whole shape.
*/

import { list, number, record, text, words } from "../input/clean.js";

const SHORT = /^([a-z]+)(?::(\d{1,3}))?$/;

export class Requirement {
  constructor({ component, has, amount, name }) {
    this.component = component;
    this.has = has;
    this.amount = amount;
    this.name = name;
  }

  static read(json) {
    if (typeof json === "string") return readShort(json);

    const given = record(json);
    const component = text(given.component, "");

    if (!SHORT.test(component)) return null;

    return new Requirement({
      component,
      has: list(given.has).map(readPart),
      amount: readAmount(given.amount),
      name: text(given.name, "")
    });
  }

  get keywords() {
    return this.has.flatMap(part => part.words);
  }

  found(anatomy) {
    const limbs = anatomy.joints(this.component).filter(limb => !this.name || anatomy.isAround(limb));

    return limbs.filter(limb => this.has.every(part => isOn(part, limb, anatomy)));
  }

  isMet(anatomy) {
    return within(this.found(anatomy).length, this.amount);
  }

  toJSON() {
    const { component, has, amount, name } = this;
    const isPlain = !has.length && !name;

    if (isPlain && amount.minimum === amount.maximum) return `${component}:${String(amount.minimum).padStart(2, "0")}`;
    if (isPlain && amount.minimum === 1 && amount.maximum === Infinity) return component;

    const json = { component, amount: writeAmount(amount) };

    if (has.length) json.has = has.map(writePart);
    if (name) json.name = name;

    return json;
  }
}

function readShort(text) {
  const match = SHORT.exec(text);

  if (!match) return null;

  const [, component, count] = match;

  return new Requirement({ component, has: [], amount: readAmount(count ? Number(count) : undefined), name: "" });
}

function readPart(json) {
  const { joint, shape, amount } = record(json);

  return { joint: text(joint, ""), words: words(shape), amount: readAmount(amount) };
}

function readAmount(json) {
  if (typeof json === "number") return { minimum: json, maximum: json };

  const { minimum, maximum } = record(json);

  return { minimum: number(minimum, 1, 0), maximum: number(maximum, Infinity, 0) };
}

function writePart({ joint, words, amount }) {
  return { ...joint ? { joint } : { shape: words }, amount: writeAmount(amount) };
}

function writeAmount({ minimum, maximum }) {
  if (minimum === maximum) return minimum;

  return maximum === Infinity ? { minimum } : { minimum, maximum };
}

function isOn({ joint, words, amount }, limb, anatomy) {
  const count = joint ? anatomy.jointsOn(limb, joint) : anatomy.shapesOn(limb, words);

  return within(count, amount);
}

function within(count, { minimum, maximum }) {
  return count >= minimum && count <= maximum;
}
