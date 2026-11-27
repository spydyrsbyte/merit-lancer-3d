/*
  Draws figures. Pieces which share a mesh are drawn together in one call, which
  is called instancing: four legs cost little more than one.

  It draws with a WebGL 2 context, either its own or one it is given, so it can
  draw into the canvas of somebody else. It leaves that as it needs it, so whoever
  shares it has to set up their own state again.
*/

import { COPY_LAYOUT, copyNumbers, CORNER_LAYOUT } from "./layout.js";
import { CORNER_PROGRAM, DOT_PROGRAM, SPOTLIGHTS } from "./shader.js";
import { Stock } from "./stock.js";

const UNIFORMS = [
  "uView", "uCenter", "uExtent", "uDepth", "uPixel", "uPalette", "uCount", "uLights",
  "uTarget", "uShine", "uMiddle", "uLightTurn", "uHalf"
];

export class Renderer {
  #gl;
  #program;
  #uniforms;

  constructor(gl) {
    this.#gl = gl;
    this.#program = this.#build();
    this.#uniforms = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(this.#program, name)]));

    this.stock = new Stock(gl);
    this.shine = true;
    this.calls = 0;
  }

  static on(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, depth: true });

    if (!gl) throw new Error("WebGL 2 is not available");

    return new Renderer(gl);
  }

  clear() {
    const gl = this.#gl;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  draw(figure, camera, area = this.#whole()) {
    const gl = this.#gl;
    const palette = this.stock.palette(figure);

    gl.viewport(...area);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this.#program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.uniform1i(this.#uniforms.uPalette, 0);

    this.#aim(camera, area[2]);
    this.#light(figure.spotlights);

    const groups = Map.groupBy(figure.pieces, piece => piece.mesh);

    this.calls = 0;

    for (const [mesh, pieces] of groups) this.#drawCopies(mesh, figure, pieces);

    gl.bindVertexArray(null);
  }

  close() {
    this.#gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  #whole() {
    const { width, height } = this.#gl.canvas;

    return [0, 0, width, height];
  }

  #aim(camera, width) {
    const gl = this.#gl;
    const { uView, uCenter, uExtent, uDepth, uPixel } = this.#uniforms;

    gl.uniformMatrix3fv(uView, false, camera.view);
    gl.uniform2fv(uCenter, camera.center);
    gl.uniform2fv(uExtent, camera.extent);
    gl.uniform1f(uDepth, camera.depth);
    gl.uniform1f(uPixel, camera.extent[0] * 2 / width);
  }

  #light(spotlights) {
    const gl = this.#gl;
    const { uCount, uLights, uTarget, uShine, uMiddle, uLightTurn, uHalf } = this.#uniforms;
    const count = Math.min(spotlights.length, SPOTLIGHTS);

    gl.uniform1i(uCount, count);
    gl.uniform1i(uLights, this.shine ? count : 0);

    if (!count) return;

    const numbers = read => new Float32Array(spotlights.slice(0, count).flatMap(read));

    gl.uniform4fv(uTarget, numbers(({ piece, first, last, bright }) => [piece, first, last, bright ? 1 : 0]));
    gl.uniform4fv(uShine, numbers(({ color, strength }) => [...color, strength]));
    gl.uniform4fv(uMiddle, numbers(({ middle, reach }) => [...middle, reach]));
    gl.uniform4fv(uLightTurn, numbers(({ turn }) => turn.numbers));
    gl.uniform3fv(uHalf, numbers(({ half }) => half));
  }

  #drawCopies(mesh, figure, pieces) {
    if (!mesh.indices.length) return;

    const gl = this.#gl;
    const { array, copies, count } = this.stock.mesh(mesh);

    gl.bindVertexArray(array);
    gl.bindBuffer(gl.ARRAY_BUFFER, copies);
    gl.bufferData(gl.ARRAY_BUFFER, copyNumbers(figure, pieces), gl.DYNAMIC_DRAW);
    gl.drawElementsInstanced(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0, pieces.length);

    this.calls++;
  }

  #build() {
    const gl = this.#gl;
    const program = gl.createProgram();

    gl.attachShader(program, this.#compile(gl.VERTEX_SHADER, CORNER_PROGRAM));
    gl.attachShader(program, this.#compile(gl.FRAGMENT_SHADER, DOT_PROGRAM));

    for (const { name, slot } of [...CORNER_LAYOUT.attributes, ...COPY_LAYOUT.attributes]) {
      gl.bindAttribLocation(program, slot, name);
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

    return program;
  }

  #compile(type, source) {
    const gl = this.#gl;
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));

    return shader;
  }
}
