/*
  Decals project vector artwork onto the mesh which carries their placement box.
  The box follows its limb. Fragment clipping keeps the drawing inside the box
  and off surfaces facing away. Textures are shared and prepared before portraits.
*/

import { decalCanvas } from "../decal/picture.js";
import { STANDARD_NAMES } from "../paint/material.js";
import { Transform } from "../space/transform.js";
import { Turn } from "../space/turn.js";

export const DECAL_VERTEX = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec3 aRight;
in vec3 aForward;
in vec3 aUp;
in vec3 aOrigin;
uniform mat3 uView;
uniform vec2 uCenter;
uniform vec2 uExtent;
uniform float uDepth;
uniform mat3 uBack;
uniform vec3 uOrigin;
out vec3 vPoint;
out vec3 vNormal;
out vec3 vFacing;
void main() {
  mat3 axes = mat3(aRight, aForward, aUp);
  mat3 sides = mat3(cross(aForward,aUp),cross(aUp,aRight),cross(aRight,aForward));
  vec3 world = axes * aPosition + aOrigin;
  vec3 normal = normalize(sides * aNormal * sign(dot(aRight,sides[0])));
  vec3 seen = uView * world;
  vPoint = uBack * (world - uOrigin);
  vNormal = uView * normal;
  vFacing = uBack * normal;
  gl_Position = vec4((seen.xy-uCenter)/uExtent, -seen.z/uDepth, 1.0);
}`;

export const DECAL_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPoint;
in vec3 vNormal;
in vec3 vFacing;
uniform sampler2D uArt;
uniform vec3 uSize;
uniform float uOpacity;
uniform float uGlow;
uniform float uWear;
out vec4 color;
void main() {
  if (any(greaterThan(abs(vPoint),uSize*0.5)) || normalize(vFacing).y < 0.12) discard;
  vec2 uv = vec2(0.5-vPoint.x/uSize.x,0.5-vPoint.z/uSize.z);
  vec4 art = texture(uArt,uv);
  float noise = fract(sin(dot(floor(uv*150.0),vec2(12.9898,78.233)))*43758.5453);
  if (noise < uWear*uWear) discard;
  vec3 normal = normalize(vNormal);
  float lamp = max(dot(normal,normalize(vec3(-0.5,0.6,0.62))),0.0);
  float sky = normal.y*0.5+0.5;
  vec3 lit = art.rgb*(0.34+0.22*sky+0.62*lamp);
  color = vec4(mix(lit,art.rgb,uGlow),art.a*uOpacity);
}`;

export class DecalTextures {
  #gl;
  #entries = new Map();
  #closed = false;

  constructor(gl) {
    this.#gl = gl;
    this.changed = () => {};
  }

  entry(figure, place) {
    if (!place.decal.art) return null;

    const colors = Object.fromEntries(STANDARD_NAMES.map(name => [name, figure.material(name).colors[0]]));
    const ratio = place.decal.size[0] / place.decal.size[2];
    const width = Math.max(1, Math.round(256 * Math.min(ratio, 1)));
    const height = Math.max(1, Math.round(256 / Math.max(ratio, 1)));
    const key = JSON.stringify([place.decal.art, colors, place.decal.values, width, height]);

    if (this.#entries.has(key)) return this.#entries.get(key);

    const entry = { texture: null, promise: null };

    entry.promise = decalCanvas(place.decal.art, colors, place.decal.values, width, height).then(canvas => {
      if (this.#closed) return;

      const gl = this.#gl;

      entry.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.changed();
    });
    entry.promise.catch(error => { entry.error = error; });
    this.#entries.set(key, entry);

    return entry;
  }

  close() {
    this.#closed = true;
    for (const entry of this.#entries.values()) if (entry.texture) this.#gl.deleteTexture(entry.texture);
    this.#entries.clear();
  }

  async prepare(figure) {
    await Promise.all(figure.decals.map(place => this.entry(figure, place)?.promise));
  }
}

export function decalBack(place) {
  return place.world.times(Transform.at([0, 0, 0], Turn.degrees([0, -place.decal.spin, 0]))).inverse;
}
