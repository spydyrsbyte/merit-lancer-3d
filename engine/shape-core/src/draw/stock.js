/*
  The Stock is what is on the graphics card: a mesh once, however many figures use
  it, and the palette of each figure.
*/

import { COPY_LAYOUT, cornerNumbers, CORNER_LAYOUT } from "./layout.js";

const BYTES = 4;

export class Stock {
  #gl;
  #meshes = new Map();
  #palettes = new Map();

  constructor(gl) {
    this.#gl = gl;
  }

  mesh(mesh) {
    if (!this.#meshes.has(mesh)) this.#meshes.set(mesh, this.#loadMesh(mesh));

    return this.#meshes.get(mesh);
  }

  palette(figure) {
    const known = this.#palettes.get(figure);

    if (known?.repaints === figure.repaints) return known.texture;

    const gl = this.#gl;
    const texture = known?.texture ?? gl.createTexture();
    const { width, rows } = figure.palette;
    const bytes = figure.palette.bytes(name => figure.material(name));

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);

    this.#palettes.set(figure, { texture, repaints: figure.repaints });

    return texture;
  }

  dropMesh(mesh) {
    const known = this.#meshes.get(mesh);

    if (!known) return;

    const gl = this.#gl;

    gl.deleteVertexArray(known.array);
    gl.deleteBuffer(known.corners);
    gl.deleteBuffer(known.indices);
    gl.deleteBuffer(known.copies);

    this.#meshes.delete(mesh);
  }

  dropFigure(figure) {
    const known = this.#palettes.get(figure);

    if (!known) return;

    this.#gl.deleteTexture(known.texture);
    this.#palettes.delete(figure);
  }

  #loadMesh(mesh) {
    const gl = this.#gl;
    const array = gl.createVertexArray();
    const corners = gl.createBuffer();
    const indices = gl.createBuffer();
    const copies = gl.createBuffer();

    gl.bindVertexArray(array);

    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, cornerNumbers(mesh), gl.STATIC_DRAW);
    this.#describe(CORNER_LAYOUT, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, copies);
    this.#describe(COPY_LAYOUT, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    return { array, corners, indices, copies, count: mesh.indices.length };
  }

  #describe(layout, each) {
    const gl = this.#gl;

    for (const { slot, size, offset } of layout.attributes) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, size, gl.FLOAT, false, layout.length * BYTES, offset * BYTES);
      gl.vertexAttribDivisor(slot, each);
    }
  }
}
