/*
  Supplies shapes with their meshes, from the first of these which has one:
    1. memory
    2. the disk of the browser
    3. the source, if it is a picture which holds it
    4. the link in the JSON, which can be a picture too
    5. the recipe

  A mesh with another stamp than its shape is out of date, and is passed over.

  Shapes without a recipe come first, as where others are can depend on their size.
*/

import { Mesh } from "../mesh/mesh.js";
import { Picture } from "../picture/picture.js";
import { Png } from "../picture/png.js";

export class Supply {
  #disk;
  #warn;
  #ready = new Map();

  constructor(disk, warn) {
    this.#disk = disk;
    this.#warn = warn;
  }

  prepare(shape) {
    if (shape.builtin) return null;

    if (!this.#ready.has(shape)) this.#ready.set(shape, this.#find(shape));

    return this.#ready.get(shape);
  }

  forget(shape) {
    this.#ready.delete(shape);
  }

  async #find(shape) {
    for (const one of shape.everything) {
      if (one !== shape && !one.placements) await this.prepare(one);
    }

    const found = await this.#fromDisk(shape) || await this.#fromSource(shape) || await this.#fromLink(shape);

    if (!found) await this.#fromRecipe(shape);

    for (const { chain } of shape.limbs) await this.prepare(chain.at(-1).shape);
  }

  async #fromDisk(shape) {
    if (!this.#disk) return false;

    const bytes = await this.#disk.get(keyOf(shape)).catch(() => null);

    return Boolean(bytes) && this.#accept(shape, bytes);
  }

  async #fromSource(shape) {
    const bytes = shape.source.mesh(shape);

    if (!bytes || !this.#accept(shape, bytes)) return false;

    await this.#keep(shape, bytes);

    return true;
  }

  async #fromLink(shape) {
    if (!shape.uri) return false;

    const bytes = await this.#follow(shape).catch(() => null);

    if (!bytes) {
      this.#warn(`${shape.name}: its mesh could not be loaded`);

      return false;
    }

    if (!this.#accept(shape, bytes)) return false;

    await this.#keep(shape, bytes);

    return true;
  }

  async #fromRecipe(shape) {
    if (!shape.placements) return;

    for (const placement of shape.melted) await this.prepare(placement.shape);

    if (this.#disk) await this.#keep(shape, shape.mesh.bytes);
  }

  async #follow(shape) {
    const bytes = await shape.source.open(shape.uri);

    if (!Png.matches(bytes)) return bytes;

    const picture = await Picture.read(bytes);

    return picture?.mesh(shape) ?? null;
  }

  #accept(shape, bytes) {
    try {
      return shape.accept(Mesh.fromBytes(bytes));
    } catch (error) {
      this.#warn(`${shape.name}: ${error.message}`);

      return false;
    }
  }

  async #keep(shape, bytes) {
    if (!this.#disk) return;

    await this.#disk.put(keyOf(shape), bytes).catch(() => null);
  }
}

function keyOf(shape) {
  return `${shape.id}/${shape.stamp}`;
}
