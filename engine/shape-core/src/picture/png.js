/*
  A PNG file, as the list of blocks it is made of.

  A file is a signature and then blocks. A block is its length, a name of four
  letters, its data, and a checksum of the name and the data. IHDR comes first and
  says what kind of picture it is, the IDATs are its dots, and IEND is the last.

  The case of each letter in a name means something. In "shPe" they say: not
  needed to show the picture, private to one program, a valid name, and still
  right if the picture is changed.
*/

import { checksum } from "./checksum.js";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const FRAME = 12;

const HEADER = "IHDR";
const IMAGE = "IDAT";
const LAST = "IEND";
const COLOR_INFO = ["gAMA", "cHRM", "sRGB", "iCCP", "pHYs"];

export class Png {
  #blocks;

  constructor(blocks) {
    this.#blocks = blocks;
  }

  static matches(bytes) {
    return SIGNATURE.every((value, i) => bytes[i] === value);
  }

  static read(bytes) {
    if (!Png.matches(bytes)) throw new Error("This is not a PNG");

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const blocks = [];

    let offset = SIGNATURE.length;

    while (offset + FRAME <= bytes.length) {
      const length = view.getUint32(offset);
      const end = offset + FRAME + length;

      if (end > bytes.length) throw new Error("This PNG is cut off");

      const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      const check = view.getUint32(offset + 8 + length);

      blocks.push({ name, data, check });

      if (name === LAST) return new Png(blocks);

      offset = end;
    }

    throw new Error("This PNG has no end");
  }

  get bytes() {
    const size = this.#blocks.reduce((sum, { data }) => sum + FRAME + data.length, SIGNATURE.length);
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);

    let offset = SIGNATURE.length;

    bytes.set(SIGNATURE);

    for (const { name, data, check } of this.#blocks) {
      view.setUint32(offset, data.length);
      bytes.set(letters(name), offset + 4);
      bytes.set(data, offset + 8);
      view.setUint32(offset + 8 + data.length, check);

      offset += FRAME + data.length;
    }

    return bytes;
  }

  get header() {
    return this.get(HEADER);
  }

  get image() {
    const parts = this.#blocks.filter(({ name }) => name === IMAGE).map(({ data }) => data);
    const image = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));

    let offset = 0;

    for (const part of parts) {
      image.set(part, offset);
      offset += part.length;
    }

    return image;
  }

  get(name) {
    const block = this.#blocks.find(entry => entry.name === name);

    if (!block) return null;
    if (block.check !== checksum(letters(name), block.data)) throw new Error("The data in this PNG is damaged");

    return block.data;
  }

  set(name, data) {
    const others = this.#blocks.filter(entry => entry.name !== name);

    this.#blocks = [...others.slice(0, -1), blockOf(name, data), others.at(-1)];
  }

  withImage(header, image) {
    const info = this.#blocks.filter(({ name }) => COLOR_INFO.includes(name));

    return new Png([blockOf(HEADER, header), ...info, blockOf(IMAGE, image), blockOf(LAST, new Uint8Array())]);
  }
}

function blockOf(name, data) {
  return { name, data, check: checksum(letters(name), data) };
}

function letters(name) {
  return Uint8Array.from(name, letter => letter.charCodeAt(0));
}
