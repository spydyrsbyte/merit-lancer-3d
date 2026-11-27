/*
  A mesh as bytes, for files, links and the cache in the browser.

    4 bytes   "MESH"
    4 bytes   the length of the header
    header    JSON: format, stamp, counts and surfaces, padded with spaces
    floats    positions
    ints      indices
    shorts    normals, where 32767 is 1
    shorts    owners

  The header is padded, and the blocks go from the largest numbers to the
  smallest, because numbers have to start at a multiple of their own size.
  Everything is little endian, which is what every browser runs on.
*/

import { Surface } from "./surface.js";

const MAGIC = 0x4853454d;
const FORMAT = 1;
const START = 8;
const FULL = 32767;
const SPACE = 32;

export function encode(mesh) {
  const header = headerOf(mesh);

  const blocks = [
    header,
    mesh.positions,
    mesh.indices,
    Int16Array.from(mesh.normals, n => Math.round(n * FULL)),
    mesh.owners
  ];

  const size = blocks.reduce((sum, block) => sum + block.byteLength, START);
  const bytes = new Uint8Array(size);

  let offset = START;

  new Uint32Array(bytes.buffer, 0, 2).set([MAGIC, header.length]);

  for (const block of blocks) {
    bytes.set(new Uint8Array(block.buffer, block.byteOffset, block.byteLength), offset);
    offset += block.byteLength;
  }

  return bytes;
}

export function decode(bytes) {
  const { buffer } = new Uint8Array(bytes);

  if (buffer.byteLength < START) throw new Error("This is not a mesh");

  const [magic, length] = new Uint32Array(buffer, 0, 2);

  if (magic !== MAGIC) throw new Error("This is not a mesh");

  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, START, length)));

  if (header.format !== FORMAT) throw new Error(`Mesh format ${header.format} is not known`);

  let offset = START + length;

  const take = (Block, count) => {
    const block = new Block(buffer, offset, count);

    offset += block.byteLength;

    return block;
  };

  const positions = take(Float32Array, header.corners * 3);
  const indices = take(Uint32Array, header.indices);
  const normals = Float32Array.from(take(Int16Array, header.corners * 3), n => n / FULL);
  const owners = take(Uint16Array, header.corners);
  const surfaces = header.surfaces.map(Surface.fromJSON);

  return { positions, normals, owners, indices, surfaces, stamp: header.stamp };
}

function headerOf(mesh) {
  const text = JSON.stringify({
    format: FORMAT,
    stamp: mesh.stamp,
    corners: mesh.corners,
    indices: mesh.indices.length,
    surfaces: mesh.surfaces
  });

  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(SPACE);

  padded.set(bytes);

  return padded;
}
