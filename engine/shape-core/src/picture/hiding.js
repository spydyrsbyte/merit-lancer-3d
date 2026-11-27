/*
  Hides bytes in the dots of a picture, where nobody sees them.

  The last binary digit of a color is worth 1 of 255. Replacing it with a bit of
  data changes the color by at most 1. With two digits it is at most 3, and with
  three at most 7. That is the depth, and the smallest which fits is used.

  Only solid dots are used, since see-through ones can get rounded. They are used
  row by row, from the top left:
    first dot   the depth, as the last digit of red and of green: 1, 2, 3 or 0
    the rest    "shPe", the length, a checksum, and then the bytes

  Dots which are not needed stay as they are. Any picture seems to have a depth,
  so it is the letters which tell whether something is hidden.

  It survives everything which keeps the dots. Resizing it or saving it as a JPEG
  mixes them, and then the letters or the checksum are wrong.
*/

import { checksum } from "./checksum.js";

const LETTERS = [115, 104, 80, 101];
const FRAME = 12;
const COLORS = 3;
const DEPTHS = [1, 2, 3];

export function hide(dots, bytes) {
  const solid = dots.solid;
  const data = framed(bytes);
  const depth = DEPTHS.find(digits => roomIn(solid, digits) >= data.length);

  if (!depth) return false;

  const { numbers } = dots;
  const first = solid[0];

  numbers[first] = withDigits(numbers[first], depth >> 1, 1);
  numbers[first + 1] = withDigits(numbers[first + 1], depth & 1, 1);

  const places = placesIn(solid);
  const bits = data.length * 8;

  for (let bit = 0; bit < bits; bit += depth) {
    const place = places.next().value;

    numbers[place] = withDigits(numbers[place], readBits(data, bit, depth), depth);
  }

  return true;
}

export function reveal(dots) {
  const solid = dots.solid;

  if (!solid.length) return null;

  const { numbers } = dots;
  const first = solid[0];
  const depth = (numbers[first] & 1) << 1 | numbers[first + 1] & 1;

  if (!depth) return null;

  const room = roomIn(solid, depth);
  const frame = collect(dots, solid, depth, Math.min(FRAME, room));

  if (frame.length < FRAME || LETTERS.some((letter, i) => frame[i] !== letter)) return null;

  const view = new DataView(frame.buffer);
  const length = view.getUint32(4);

  if (length > room - FRAME) throw new Error("The data in this picture is damaged");

  const bytes = collect(dots, solid, depth, FRAME + length).slice(FRAME);

  if (checksum(bytes) !== view.getUint32(8)) throw new Error("The data in this picture is damaged");

  return bytes;
}

function framed(bytes) {
  const data = new Uint8Array(FRAME + bytes.length);
  const view = new DataView(data.buffer);

  data.set(LETTERS);
  view.setUint32(4, bytes.length);
  view.setUint32(8, checksum(bytes));
  data.set(bytes, FRAME);

  return data;
}

function collect(dots, solid, depth, size) {
  const data = new Uint8Array(size);
  const places = placesIn(solid);

  for (let bit = 0; bit < size * 8; bit += depth) {
    const digits = dots.numbers[places.next().value] & (1 << depth) - 1;

    writeBits(data, bit, depth, digits);
  }

  return data;
}

function roomIn(solid, depth) {
  return Math.max(0, Math.floor((solid.length - 1) * COLORS * depth / 8));
}

function* placesIn(solid) {
  for (let dot = 1; dot < solid.length; dot++) {
    for (let color = 0; color < COLORS; color++) yield solid[dot] + color;
  }
}

function withDigits(number, digits, depth) {
  const others = number >> depth << depth;

  return others | digits;
}

function readBits(data, start, count) {
  let value = 0;

  for (let bit = start; bit < start + count; bit++) value = value << 1 | data[bit >> 3] >> 7 - (bit & 7) & 1;

  return value;
}

function writeBits(data, start, count, value) {
  for (let i = 0; i < count; i++) {
    const bit = start + i;

    if (value >> count - 1 - i & 1) data[bit >> 3] |= 1 << 7 - (bit & 7);
  }
}
