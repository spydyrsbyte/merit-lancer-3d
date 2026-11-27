/*
  The dots of a PNG: four numbers each, for red, green, blue and how solid it is.

  They are read from the file itself and not off a drawn picture, because some
  browsers change those a little, so that pages cannot recognize their user.

  A PNG can store dots as full colors, as grays, or as numbers of a list of colors.
  All are understood, since a website may swap one for another to save space. Two
  rare kinds are not: 16 bits for each color, and interlaced.

  The header of a picture is its width, height, bits, kind, and three more bytes
  of which the last says whether it is interlaced.
*/

import { filter, unfilter } from "./filters.js";
import { squeeze, unsqueeze } from "./squeeze.js";

const GRAY = 0;
const COLORS = 2;
const LISTED = 3;
const GRAY_SOLID = 4;
const COLORS_SOLID = 6;

const CHANNELS = { [GRAY]: 1, [COLORS]: 3, [LISTED]: 1, [GRAY_SOLID]: 2, [COLORS_SOLID]: 4 };
const SOLID = 255;
const HEADER_SIZE = 13;

export class Dots {
  constructor(width, height, numbers) {
    this.width = width;
    this.height = height;
    this.numbers = numbers;
  }

  static async of(png) {
    const { header } = png;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);

    const width = view.getUint32(0);
    const height = view.getUint32(4);
    const bits = header[8];
    const kind = header[9];
    const interlaced = header[12] === 1;

    if (bits > 8 || interlaced || !CHANNELS[kind]) return null;

    const dotBits = CHANNELS[kind] * bits;
    const rowSize = Math.ceil(width * dotBits / 8);
    const step = Math.ceil(dotBits / 8);

    const filtered = await unsqueeze(png.image);

    if (filtered.length < (rowSize + 1) * height) throw new Error("This PNG is damaged");

    const rows = unfilter(filtered, rowSize, height, step);
    const samples = bits === 8 ? rows : unpack(rows, width * CHANNELS[kind], height, rowSize, bits);

    return new Dots(width, height, fullColors(samples, kind, bits, png));
  }

  get solid() {
    const found = [];

    for (let i = 3; i < this.numbers.length; i += 4) {
      if (this.numbers[i] === SOLID) found.push(i - 3);
    }

    return found;
  }

  async into(png) {
    const header = new Uint8Array(HEADER_SIZE);
    const view = new DataView(header.buffer);

    view.setUint32(0, this.width);
    view.setUint32(4, this.height);
    header.set([8, COLORS_SOLID], 8);

    const image = await squeeze(filter(this.numbers, this.width * 4, this.height, 4));

    return png.withImage(header, image);
  }
}

function unpack(rows, across, height, rowSize, bits) {
  const out = new Uint8Array(across * height);
  const most = (1 << bits) - 1;

  for (let row = 0; row < height; row++) {
    for (let i = 0; i < across; i++) {
      const bit = i * bits;
      const byte = rows[row * rowSize + (bit >> 3)];

      out[row * across + i] = byte >> 8 - bits - (bit & 7) & most;
    }
  }

  return out;
}

function fullColors(samples, kind, bits, png) {
  if (kind === COLORS_SOLID) return samples;

  const channels = CHANNELS[kind];
  const count = samples.length / channels;
  const out = new Uint8Array(count * 4);
  const read = readerOf(kind, bits, png);

  for (let dot = 0; dot < count; dot++) out.set(read(samples, dot * channels), dot * 4);

  return out;
}

function readerOf(kind, bits, png) {
  const clear = png.get("tRNS");

  if (kind === LISTED) {
    const list = png.get("PLTE") ?? [];

    return (samples, at) => {
      const entry = samples[at];

      return [list[entry * 3], list[entry * 3 + 1], list[entry * 3 + 2], clear?.[entry] ?? SOLID];
    };
  }

  if (kind === GRAY_SOLID) return (samples, at) => [samples[at], samples[at], samples[at], samples[at + 1]];

  if (kind === GRAY) {
    const brightest = SOLID / ((1 << bits) - 1);

    return (samples, at) => {
      const gray = samples[at] * brightest;

      return [gray, gray, gray, clear?.[1] === samples[at] ? 0 : SOLID];
    };
  }

  return (samples, at) => {
    const color = [samples[at], samples[at + 1], samples[at + 2]];
    const isClear = clear && color.every((number, i) => number === clear[i * 2 + 1]);

    return [...color, isClear ? 0 : SOLID];
  };
}
