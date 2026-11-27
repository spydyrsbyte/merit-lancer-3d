/*
  The Edges of some surfaces of a mesh, which is what one would draw with a pencil:
  where two sides meet at an angle, and where a side ends. Each is two points.

  Corners in the same spot count as one. The edge of a curved side is none, as its
  triangles meet almost flat. All edges of a mesh are found once, with the surfaces
  they are of.
*/

import { cross, dot, subtract, unit } from "../../../shape-core/src/index.js";

const FLAT = Math.cos(22 * Math.PI / 180);
const FINE = 1000;
const known = new WeakMap();

export function edgesOf(mesh, wanted = () => true) {
  if (!known.has(mesh)) known.set(mesh, findEdges(mesh));

  return known.get(mesh).filter(({ surface }) => wanted(surface)).map(({ line }) => line);
}

function findEdges(mesh) {
  const found = new Map();
  const { indices, owners } = mesh;

  for (let i = 0; i < indices.length; i += 3) {
    const owner = owners[indices[i]];
    const points = [0, 1, 2].map(k => mesh.point(indices[i + k]));
    const normal = unit(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));

    points.forEach((start, k) => note(found, start, points[(k + 1) % 3], normal, owner));
  }

  return [...found.values()].filter(isSharp).map(({ line, owner }) => ({ line, surface: mesh.surfaces[owner] }));
}

export function boxEdges(low, high) {
  const corner = bits => [0, 1, 2].map(axis => bits >> axis & 1 ? high[axis] : low[axis]);
  const pairs = [0, 1, 2, 3, 4, 5, 6, 7].flatMap(from => [1, 2, 4].filter(bit => !(from & bit)).map(bit => [from, from | bit]));

  return pairs.map(([from, to]) => [corner(from), corner(to)]);
}

function note(found, start, end, normal, owner) {
  const keys = [keyOf(start), keyOf(end)].sort();
  const key = [owner, ...keys].join("|");

  if (!found.has(key)) found.set(key, { line: [start, end], normals: [], owner });

  found.get(key).normals.push(normal);
}

function isSharp({ normals: [first, ...others] }) {
  return !others.length || others.some(normal => dot(first, normal) < FLAT);
}

function keyOf(point) {
  return point.map(number => Math.round(number * FINE)).join();
}
