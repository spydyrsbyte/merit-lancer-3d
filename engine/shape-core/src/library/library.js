/*
  The Library finds shapes by id and gets them ready to draw.

  Loading has three steps. Gather reads the JSON of a shape and of everything it
  uses. Link connects each placement to its shape. Then the supply brings the
  meshes (see supply.js).

  If several sources have a shape, the highest revision is used. A picture which is
  opened becomes one more source.

  A shape can also be put in as it is, such as one which is being built. It is linked
  to what is loaded already, and nothing is fetched.

  A shape which is missing, not valid, or would contain itself, becomes a plain
  box, so one bad shape never takes the rest with it. The warnings say why.

  Animations are found the same way, by id, and kept once. One which cannot be found
  or read is nothing, and the reason is given back with it.
*/

import { Animation } from "../motion/animation.js";
import { Picture } from "../picture/picture.js";
import { Shape } from "../shape/shape.js";
import { BUILTINS, PLACEHOLDER } from "../solid/builtin.js";
import { Shelf } from "./sources.js";
import { Supply } from "./supply.js";

const NOWHERE = new Shelf();

export class Library {
  #sources;
  #supply;
  #shapes = new Map();
  #animations = new Map();

  constructor(sources = [], disk = null) {
    this.warnings = new Set();

    this.#sources = [...sources];
    this.#supply = new Supply(disk, warning => this.#warn(warning));
  }

  async animation(key) {
    if (this.#animations.has(key)) return { animation: this.#animations.get(key), reason: "" };

    const answers = await Promise.all(this.#sources.map(source => source.read(key).catch(() => null)));
    const json = answers.filter(Boolean).reduce((best, next) => (next.revision ?? 1) > (best?.revision ?? 0) ? next : best, null);

    if (!json) return { animation: null, reason: `there is no animation ${key}` };

    try {
      const animation = new Animation(json);

      this.#animations.set(key, animation);

      return { animation, reason: "" };
    } catch (error) {
      return { animation: null, reason: `${json.name ?? key}: ${error.message}` };
    }
  }

  findAnimation(key) {
    return this.#animations.get(key) ?? null;
  }

  add(source) {
    this.#sources.push(source);
  }

  async load(key) {
    const shape = await this.#gather(key);

    if (!shape) throw new Error(`There is no shape ${key}`);

    this.#link(shape, []);
    await this.#supply.prepare(shape);

    return shape;
  }

  async open(bytes) {
    const picture = await Picture.read(bytes);

    if (!picture) return null;

    const isOlder = json => (this.find(json.id)?.revision ?? Infinity) < json.revision;

    for (const json of picture.shapes.filter(isOlder)) this.forget(json.id);

    this.#sources.push(picture);

    return this.load(picture.top);
  }

  put(json) {
    const shape = new Shape(json);

    shape.source = NOWHERE;

    this.forget(shape.id);
    this.#shapes.set(shape.id, shape);
    this.link(shape);

    return shape;
  }

  link(shape) {
    this.#link(shape, []);
  }

  find(key) {
    return BUILTINS.get(key) ?? this.#shapes.get(key) ?? null;
  }

  forget(key) {
    this.#supply.forget(this.find(key));
    this.#shapes.delete(key);
  }

  async #gather(key) {
    const shape = await this.#read(key);

    if (!shape) return null;

    const waiting = [shape];

    for (const next of waiting) {
      const found = await Promise.all(next.parts.map(placement => this.#read(placement.key)));

      for (const other of found) {
        if (other && !waiting.includes(other)) waiting.push(other);
      }
    }

    return shape;
  }

  async #read(key) {
    if (this.find(key)) return this.find(key);

    const answers = await Promise.all(this.#sources.map(async source => ({ source, json: await source.read(key) })));
    const known = answers.filter(({ json }) => json);

    if (this.find(key)) return this.find(key);
    if (!known.length) return null;

    const { json, source } = known.reduce((best, next) => revisionOf(next) > revisionOf(best) ? next : best);
    const shape = this.#make(json, key);

    if (!shape) return null;

    shape.source = source;
    this.#shapes.set(key, shape);

    return shape;
  }

  #make(json, key) {
    try {
      return new Shape(json);
    } catch (error) {
      this.#warn(`${json.name ?? key}: ${error.message}`);

      return null;
    }
  }

  #link(shape, outer) {
    const trail = [...outer, shape];

    for (const placement of shape.parts) {
      const other = this.find(placement.key);
      const loops = trail.includes(other);
      const usable = other && !loops;

      if (!other) this.#warn(`${shape.name}: there is no shape ${placement.key}`);
      if (loops) this.#warn(`${shape.name}: ${other.name} would contain itself`);

      placement.shape = usable ? other : PLACEHOLDER;

      if (usable) this.#link(other, trail);
    }

    for (const warning of shape.warnings) this.#warn(warning);
  }

  #warn(warning) {
    this.warnings.add(warning);
  }
}

function revisionOf({ json }) {
  return json.revision ?? 1;
}
