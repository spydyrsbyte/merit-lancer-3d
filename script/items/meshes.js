/*
  The meshes an item keeps: the finished triangles of each piece of what it shows, so
  that nothing has to be cut when it is loaded. Pieces of the same shape, such as four
  legs, keep one.

  Each is { shape, stamp, joint, data }: the shape it is the mesh of, which version of
  that shape, the joint the piece bends on (nothing for the body), and the mesh in the
  bytes of the engine (see mesh/file.js of shape-core), deflated and in Base64.

  A mesh whose stamp is not that of its shape any more is passed over by the engine,
  which then makes it anew.
*/

import { Figure } from "../../engine/shape-core/src/index.js";

const CHUNK = 0x8000;

export function keyOf(shape, stamp) {
  return `${shape}/${stamp}`;
}

export function piecesOf(shape) {
  const found = new Map();

  for (const piece of new Figure(shape, {}, false).pieces) {
    const one = piece.shape;

    if (one.builtin || !one.placements && !one.uri) continue;

    const key = keyOf(one.id, one.stamp);

    if (!found.has(key)) found.set(key, { shape: one.id, stamp: one.stamp, joint: piece.name, mesh: one.mesh });
  }

  return [...found.values()];
}

export async function pack(pieces) {
  const packed = [];

  for (const { shape, stamp, joint, mesh } of pieces) packed.push({ shape, stamp, joint, data: toBase64(await squeeze(mesh.bytes)) });

  return packed;
}

export async function unpack(meshes) {
  const found = new Map();

  for (const { shape, stamp, data } of meshes ?? []) {
    const bytes = await unsqueeze(fromBase64(data)).catch(() => null);

    if (bytes) found.set(keyOf(shape, stamp), bytes);
  }

  return found;
}

export function sameMeshes(kept, pieces) {
  const keys = new Set((kept ?? []).map(({ shape, stamp }) => keyOf(shape, stamp)));

  return keys.size === pieces.length && pieces.every(({ shape, stamp }) => keys.has(keyOf(shape, stamp)));
}

async function squeeze(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unsqueeze(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes) {
  let text = "";

  for (let start = 0; start < bytes.length; start += CHUNK) text += String.fromCharCode(...bytes.subarray(start, start + CHUNK));

  return btoa(text);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), letter => letter.charCodeAt(0));
}
