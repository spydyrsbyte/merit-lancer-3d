/*
  What the graphics card is told about each corner and about each copy of a mesh,
  as a name and how many numbers it has. The order is the order in memory.

  Corners:
    aPosition, aNormal  where it is and what it faces, in its mesh
    aLocal, aTurn       where it is in the space of its pattern, and that space
    aGrain              the angle and zoom of the pattern, and -1 if mirrored
    aSlot, aSurface     which material of the mesh, and which surface

  Copies:
    aRight, aForward, aUp, aOrigin   the transform of the copy
    aRow                             the row its materials start at
    aPiece                           which piece of the figure it is
*/

import { Turn } from "../space/turn.js";

const CORNER = [
  ["aPosition", 3], ["aNormal", 3], ["aLocal", 3], ["aTurn", 4], ["aGrain", 3], ["aSlot", 1], ["aSurface", 1]
];

const COPY = [
  ["aRight", 3], ["aForward", 3], ["aUp", 3], ["aOrigin", 3], ["aRow", 1], ["aPiece", 1]
];

export const CORNER_LAYOUT = layout(CORNER, 0);
export const COPY_LAYOUT = layout(COPY, CORNER.length);

export function cornerNumbers(mesh) {
  const numbers = new Float32Array(mesh.corners * CORNER_LAYOUT.length);

  for (let corner = 0; corner < mesh.corners; corner++) {
    const owner = mesh.owners[corner];
    const surface = mesh.surfaces[owner];
    const point = mesh.point(corner);

    const values = [
      ...point,
      ...mesh.normal(corner),
      ...surface.local(point),
      ...surface.turn.numbers,
      surface.angle * Math.PI / 180, surface.zoom, surface.mirrored ? -1 : 1,
      mesh.slots.indexOf(surface.material),
      owner
    ];

    numbers.set(values, corner * CORNER_LAYOUT.length);
  }

  return numbers;
}

export function copyNumbers(figure, pieces) {
  const numbers = pieces.map(piece => [
    ...piece.world.axes.flat(),
    ...piece.world.origin,
    piece.row,
    figure.pieces.indexOf(piece)
  ]);

  return new Float32Array(numbers.flat());
}

function layout(fields, firstSlot) {
  let offset = 0;

  const attributes = fields.map(([name, size], i) => {
    const attribute = { name, size, offset, slot: firstSlot + i };

    offset += size;

    return attribute;
  });

  return { attributes, length: offset };
}
