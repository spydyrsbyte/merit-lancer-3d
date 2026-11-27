/*
  A Picture is a PNG which holds a shape, with everything the shape uses. It looks
  like any other picture, and can be a source for a library.

  It holds the shape twice:
    in a block of its own   with all the meshes which get drawn
    hidden in its dots      without them, as they can be made from the recipe

  Some websites throw away blocks they do not know. Then the shape comes from the
  dots, and only takes a moment longer the first time. A shape without a recipe
  has its mesh in both, since it has nothing else.

  Hidden is whether the dots had enough room. If not, only the block has it.

  Whoever makes one can change how each shape in it is written, such as to name its
  rules by their id.

  It can hold animations as well: those of the shape's own, which go along with it. They
  are found by their id, as the shapes are, in the block and in the dots.
*/

import { Dots } from "./dots.js";
import { hide, reveal } from "./hiding.js";
import { pack, unpack } from "./package.js";
import { Png } from "./png.js";

const BLOCK = "shPe";

export class Picture {
  #shapes;
  #meshes;
  #animations;

  constructor(top, shapes, meshes, animations = []) {
    this.top = top;
    this.hidden = false;

    this.#shapes = shapes;
    this.#meshes = new Map(meshes);
    this.#animations = animations;
  }

  static of(shape, written = json => json, animations = []) {
    const meshes = [...drawn(shape)].map(one => [keyOf(one), one.mesh.bytes]);
    const shapes = [...shape.everything].map(one => written(JSON.parse(JSON.stringify(one))));

    for (const json of shapes) json.data = { uri: "" };

    return new Picture(shape.id, shapes, meshes, animations);
  }

  static async read(bytes) {
    const png = Png.read(bytes);
    const found = fromBlock(png) ?? await fromDots(png);

    if (!found) return null;

    const { top, shapes, meshes, animations } = await unpack(found);

    return new Picture(top, shapes, meshes, animations);
  }

  get shapes() {
    return this.#shapes;
  }

  get animations() {
    return this.#animations;
  }

  async into(bytes) {
    const cover = Png.read(bytes);
    const dots = await Dots.of(cover);
    const recipe = await pack(this.top, this.#shapes, this.#needed, this.#animations);

    this.hidden = dots ? hide(dots, recipe) : false;

    const png = this.hidden ? await dots.into(cover) : cover;
    const everything = await pack(this.top, this.#shapes, [...this.#meshes], this.#animations);

    png.set(BLOCK, everything);

    return png.bytes;
  }

  async read(key) {
    const isIt = json => key === json.id || key === keyOf(json);

    return this.#shapes.find(isIt) ?? this.#animations.find(isIt) ?? null;
  }

  async open() {
    return null;
  }

  mesh(shape) {
    return this.#meshes.get(keyOf(shape)) ?? null;
  }

  get #needed() {
    const withoutRecipe = this.#shapes.filter(json => !json.shapes).map(keyOf);

    return [...this.#meshes].filter(([key]) => withoutRecipe.includes(key));
  }
}

function fromBlock(png) {
  try {
    return png.get(BLOCK);
  } catch {
    return null;
  }
}

async function fromDots(png) {
  const dots = await Dots.of(png);

  return dots ? reveal(dots) : null;
}

function keyOf({ id, revision }) {
  return `${id}@${revision}`;
}

function drawn(shape, found = new Set()) {
  if (shape.builtin || found.has(shape)) return found;

  found.add(shape);

  for (const { chain } of shape.limbs) drawn(chain.at(-1).shape, found);
  for (const one of shape.everything) if (!one.placements) found.add(one);

  return found;
}
