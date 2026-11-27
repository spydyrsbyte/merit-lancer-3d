/*
  The Picker finds what is under the pointer: which piece of a figure, where on it,
  which way that spot looks, and the surface it is on.

  It goes through all triangles and takes the closest which the ray hits. The known
  way to do that is called "Moller-Trumbore". Where the corners of a figure are in the
  world is worked out once for each figure, as it happens whenever the pointer moves.
*/

import { cross, dot, subtract, unit } from "../../../shape-core/src/index.js";

const PARALLEL = 1e-9;
const known = new WeakMap();

export function forget(figure) {
  known.delete(figure);
}

export function pick(figure, ray) {
  let best = null;

  for (const { piece, corners } of cornersOf(figure)) {
    const { indices } = piece.mesh;

    for (let i = 0; i < indices.length; i += 3) {
      const distance = hit(ray, corners, indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3);

      if (distance === null || (best && distance >= best.distance)) continue;

      best = { distance, piece, corners, triangle: i };
    }
  }

  if (!best) return null;

  const { distance, piece, corners, triangle } = best;
  const { mesh } = piece;
  const points = [0, 1, 2].map(k => at(corners, mesh.indices[triangle + k] * 3));
  const surface = mesh.surfaces[mesh.owners[mesh.indices[triangle]]];

  return {
    piece,
    path: piece.chain.length ? piece.path : surface.path.slice(0, 1),
    surface,
    point: ray.from.map((number, axis) => number + ray.toward[axis] * distance),
    normal: facing(points, ray)
  };
}

function cornersOf(figure) {
  if (!known.has(figure)) {
    known.set(figure, figure.pieces.map(piece => ({ piece, corners: worldCorners(piece) })));
  }

  return known.get(figure);
}

function worldCorners({ mesh, world }) {
  const corners = new Float64Array(mesh.corners * 3);

  for (let corner = 0; corner < mesh.corners; corner++) corners.set(world.point(mesh.point(corner)), corner * 3);

  return corners;
}

function at(corners, start) {
  return [corners[start], corners[start + 1], corners[start + 2]];
}

function hit({ from, toward }, corners, a, b, c) {
  const abx = corners[b] - corners[a];
  const aby = corners[b + 1] - corners[a + 1];
  const abz = corners[b + 2] - corners[a + 2];
  const acx = corners[c] - corners[a];
  const acy = corners[c + 1] - corners[a + 1];
  const acz = corners[c + 2] - corners[a + 2];

  const sx = toward[1] * acz - toward[2] * acy;
  const sy = toward[2] * acx - toward[0] * acz;
  const sz = toward[0] * acy - toward[1] * acx;
  const tilt = abx * sx + aby * sy + abz * sz;

  if (Math.abs(tilt) < PARALLEL) return null;

  const x = from[0] - corners[a];
  const y = from[1] - corners[a + 1];
  const z = from[2] - corners[a + 2];
  const u = (x * sx + y * sy + z * sz) / tilt;

  if (u < 0 || u > 1) return null;

  const tx = y * abz - z * aby;
  const ty = z * abx - x * abz;
  const tz = x * aby - y * abx;
  const v = (toward[0] * tx + toward[1] * ty + toward[2] * tz) / tilt;

  if (v < 0 || u + v > 1) return null;

  return (acx * tx + acy * ty + acz * tz) / tilt;
}

function facing([a, b, c], { toward }) {
  const normal = unit(cross(subtract(b, a), subtract(c, a)));
  const side = dot(normal, toward) > 0 ? -1 : 1;

  return normal.map(number => number * side);
}
