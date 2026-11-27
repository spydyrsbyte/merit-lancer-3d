/*
  A shape, all it uses, and some of their meshes, as bytes:
    4 bytes   the length of the header
    header    JSON: format, the id of the shape, all shapes, its own animations, and
              where meshes are
    meshes    one after the other

  All of it is squeezed. A package without animations has none.
*/

import { squeeze, unsqueeze } from "./squeeze.js";

const FORMAT = 1;
const START = 4;

export async function pack(top, shapes, meshes, animations = []) {
  const places = [];

  let at = 0;

  for (const [key, bytes] of meshes) {
    places.push({ key, at, size: bytes.length });
    at += bytes.length;
  }

  const text = JSON.stringify({ format: FORMAT, top, shapes, animations, meshes: places });
  const header = new TextEncoder().encode(text);
  const contents = new Uint8Array(START + header.length + at);

  new DataView(contents.buffer).setUint32(0, header.length);
  contents.set(header, START);

  const start = START + header.length;

  places.forEach((place, i) => contents.set(meshes[i][1], start + place.at));

  return squeeze(contents);
}

export async function unpack(bytes) {
  const contents = await unsqueeze(bytes);
  const start = START + new DataView(contents.buffer).getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(contents.subarray(START, start)));

  if (header.format !== FORMAT) throw new Error(`Picture format ${header.format} is not known`);

  const meshes = header.meshes.map(({ key, at, size }) => [key, contents.slice(start + at, start + at + size)]);

  return { top: header.top, shapes: header.shapes, meshes, animations: header.animations ?? [] };
}
