/*
  A Palette is all the materials of a figure as one small picture, which the
  graphics card reads them from. Each row is a material, and its four dots are
  [color 1, pattern] [color 2, size] [color 3, bump] [bright].

  A mesh knows its materials by slot: 0, 1, 2. Each list of names gets its rows
  next to each other, so a piece only has to know the row its slots start at.

  Sizes go from 1 to 200 and have to fit in a byte, so their logarithm is stored.
*/

import { channels, PATTERNS } from "./material.js";

const DOTS = 4;
const SIZE_STEPS = 255 / 8;

export class Palette {
  #names = [];
  #starts = new Map();

  get rows() {
    return Math.max(1, this.#names.length);
  }

  get width() {
    return DOTS;
  }

  reserve(names) {
    const key = names.join();

    if (!this.#starts.has(key)) {
      this.#starts.set(key, this.#names.length);
      this.#names.push(...names);
    }

    return this.#starts.get(key);
  }

  bytes(materialNamed) {
    const bytes = new Uint8Array(this.rows * DOTS * 4);

    this.#names.forEach((name, row) => {
      const { colors, pattern, size, bump, bright } = materialNamed(name);

      const dots = [
        [...channels(colors[0]), PATTERNS.indexOf(pattern)],
        [...channels(colors[1]), Math.log2(size) * SIZE_STEPS],
        [...channels(colors[2]), bump * 255],
        [bright ? 255 : 0, 0, 0, 255]
      ];

      bytes.set(dots.flat().map(Math.round), row * DOTS * 4);
    });

    return bytes;
  }
}
