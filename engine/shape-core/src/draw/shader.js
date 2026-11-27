/*
  The shader: two programs which run on the graphics card. The first runs for each
  corner of a triangle and puts it on the screen. The second runs for each dot and
  gives it a color. What the first sends out, the second reads.

  Normals go through the cross products of the axes (see space/transform.js).

  A pattern is projected onto a shape from its front, its side and its top, and
  the three are mixed by how much the surface faces each. So it needs no map of
  where a pattern goes, and is the same on the inside of a cut. Where it is too
  small for the dots on the screen, it fades to its average.

  Its height tilts the normal, which makes it look deep. The slope is measured
  over more than a dot, so it does not shimmer.

  Light comes from the sky and from a lamp at the upper left, with a soft rim.

  A spotlight shines from the nearest spot of its box, so a long strip lights
  along all of its length. Surfaces beside it still get half, so a vent warms
  the plate it is set in. Nothing blocks it.
*/

import { PATTERN_CODE } from "./patterns.js";

export const SPOTLIGHTS = 8;

const TURN_CODE = `
vec3 turn(vec4 by, vec3 point) {
  return point + 2.0 * cross(by.xyz, cross(by.xyz, point) + by.w * point);
}

vec4 back(vec4 by) {
  return vec4(-by.xyz, by.w);
}
`;

export const CORNER_PROGRAM = `#version 300 es
precision highp float;

in vec3 aPosition;
in vec3 aNormal;
in vec3 aLocal;
in vec4 aTurn;
in vec3 aGrain;
in float aSlot;
in float aSurface;
in vec3 aRight;
in vec3 aForward;
in vec3 aUp;
in vec3 aOrigin;
in float aRow;
in float aPiece;

uniform mat3 uView;
uniform vec2 uCenter;
uniform vec2 uExtent;
uniform float uDepth;
uniform int uCount;
uniform vec4 uTarget[${SPOTLIGHTS}];
uniform vec4 uShine[${SPOTLIGHTS}];

out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vFacing;
flat out vec4 vTurn;
flat out vec3 vGrain;
flat out mat3 vAxes;
flat out float vSize;
flat out int vRow;
flat out vec4 vGlow;
flat out vec4 vBrightGlow;

${TURN_CODE}

void addGlows() {
  vGlow = vec4(0.0);
  vBrightGlow = vec4(0.0);

  for (int i = 0; i < uCount; i++) {
    vec4 target = uTarget[i];
    bool here = abs(target.x - aPiece) < 0.5 && aSurface > target.y - 0.5 && aSurface < target.z + 0.5;

    if (!here) continue;

    vec4 shine = vec4(uShine[i].rgb * uShine[i].a, uShine[i].a);

    if (target.w > 0.5) vBrightGlow += shine;
    else vGlow += shine;
  }
}

void main() {
  mat3 axes = mat3(aRight, aForward, aUp);
  mat3 sides = mat3(cross(aForward, aUp), cross(aUp, aRight), cross(aRight, aForward));
  float side = sign(dot(aRight, sides[0]));
  vec3 world = axes * aPosition + aOrigin;
  vec3 seen = uView * world;

  vWorld = world;
  vNormal = uView * (sides * aNormal * side);
  vLocal = aLocal;
  vFacing = turn(back(aTurn), aNormal);
  vTurn = aTurn;
  vGrain = aGrain;
  vAxes = axes;
  vSize = pow(abs(dot(aRight, sides[0])), 1.0 / 3.0);
  vRow = int(aRow + aSlot + 0.5);

  addGlows();

  gl_Position = vec4((seen.xy - uCenter) / uExtent, -seen.z / uDepth, 1.0);
}`;

export const DOT_PROGRAM = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vFacing;
flat in vec4 vTurn;
flat in vec3 vGrain;
flat in mat3 vAxes;
flat in float vSize;
flat in int vRow;
flat in vec4 vGlow;
flat in vec4 vBrightGlow;

uniform sampler2D uPalette;
uniform mat3 uView;
uniform float uPixel;
uniform int uCount;
uniform int uLights;
uniform vec4 uShine[${SPOTLIGHTS}];
uniform vec4 uMiddle[${SPOTLIGHTS}];
uniform vec4 uLightTurn[${SPOTLIGHTS}];
uniform vec3 uHalf[${SPOTLIGHTS}];

out vec4 color;

${TURN_CODE}
${PATTERN_CODE}

struct Look {
  vec3 base;
  vec3 slope;
};

vec2 flatSpot(int axis, vec3 point) {
  if (axis == 0) return point.yz;
  if (axis == 1) return point.xz;

  return point.xy;
}

vec3 fullSpot(int axis, vec2 spot) {
  if (axis == 0) return vec3(0.0, spot);
  if (axis == 1) return vec3(spot.x, 0.0, spot.y);

  return vec3(spot, 0.0);
}

Look look(vec4 first, vec4 second, vec4 third) {
  int id = int(first.a * 255.0 + 0.5);

  if (id == 0) return Look(first.rgb, vec3(0.0));

  float size = exp2(second.a * 8.0) * vGrain.y;
  float pixel = uPixel / (size * vSize);
  float clear = 1.0 - smoothstep(0.2, 0.5, pixel * detail(id));
  vec2 amount = vec2(0.0);
  vec3 slope = vec3(0.0);

  if (clear > 0.0) {
    float cosine = cos(vGrain.x);
    float sine = sin(vGrain.x);
    mat2 spin = mat2(cosine, -sine, sine, cosine);
    mat2 unspin = transpose(spin);
    float reach = max(pixel, 0.015);
    vec3 shares = pow(abs(normalize(vFacing)), vec3(8.0));

    shares /= shares.x + shares.y + shares.z;

    for (int axis = 0; axis < 3; axis++) {
      if (shares[axis] < 0.02) continue;

      vec2 spot = spin * flatSpot(axis, vLocal / size);
      vec3 here = pattern(id, spot, pixel);

      amount += shares[axis] * here.xy;

      if (third.a == 0.0) continue;

      float beside = pattern(id, spot + vec2(reach, 0.0), pixel).z;
      float above = pattern(id, spot + vec2(0.0, reach), pixel).z;
      vec2 rise = (vec2(beside, above) - here.z) / reach;

      slope += fullSpot(axis, unspin * rise) * shares[axis];
    }
  }

  amount = mix(average(id), amount, clear);

  vec3 base = mix(mix(first.rgb, second.rgb, amount.x), third.rgb, amount.y);

  return Look(base, slope * third.a * clear * 0.12);
}

vec3 tilted(vec3 normal, vec3 slope) {
  vec3 own = turn(vTurn, slope * vec3(vGrain.z, 1.0, 1.0));
  vec3 tilt = uView * (vAxes * own) / vSize;

  return normalize(normal - (tilt - normal * dot(normal, tilt)));
}

vec3 daylight(vec3 base, vec3 normal) {
  float lamp = max(dot(normal, normalize(vec3(-0.5, 0.6, 0.62))), 0.0);
  float sky = normal.y * 0.5 + 0.5;
  float rim = pow(1.0 - clamp(normal.z, 0.0, 1.0), 3.0);

  return base * (0.34 + 0.22 * sky + 0.62 * lamp) + vec3(0.05) * rim;
}

vec3 spotlights(vec3 base, vec3 normal) {
  vec3 total = vec3(0.0);

  for (int i = 0; i < uLights; i++) {
    float reach = uMiddle[i].w;

    if (reach <= 0.0) continue;

    vec3 inBox = turn(back(uLightTurn[i]), vWorld - uMiddle[i].xyz);
    vec3 toward = clamp(inBox, -uHalf[i], uHalf[i]) - inBox;
    float distance = length(toward);
    float fade = max(0.0, 1.0 - distance / reach);

    if (fade <= 0.0) continue;

    vec3 direction = uView * turn(uLightTurn[i], toward / max(distance, 0.001));
    float facing = distance < 0.001 ? 1.0 : dot(normal, direction) * 0.5 + 0.5;

    total += uShine[i].rgb * uShine[i].a * fade * fade * facing;
  }

  return (base + 0.05) * total * 0.9;
}

vec3 glowing(vec3 plain, vec4 glow) {
  if (glow.a <= 0.0) return plain;

  vec3 shine = glow.rgb / glow.a;
  float over = max(glow.a - 1.0, 0.0);

  return mix(plain, shine, min(glow.a, 1.0) * 0.85) + shine * over * 0.5;
}

void main() {
  vec4 first = texelFetch(uPalette, ivec2(0, vRow), 0);
  vec4 second = texelFetch(uPalette, ivec2(1, vRow), 0);
  vec4 third = texelFetch(uPalette, ivec2(2, vRow), 0);
  float bright = texelFetch(uPalette, ivec2(3, vRow), 0).r;

  Look seen = look(first, second, third);
  vec3 normal = tilted(normalize(vNormal), seen.slope);

  vec3 lit = daylight(seen.base, normal) + spotlights(seen.base, normal);
  vec3 plain = mix(lit, seen.base, bright);

  color = vec4(glowing(plain, vGlow + vBrightGlow * bright), 1.0);
}`;
