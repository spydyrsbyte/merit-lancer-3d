/*
  The patterns, as a program for the graphics card.

  pattern() answers three things about a spot: how much of the second color, how
  much of the third, and how high it is. The spot is in pattern sizes, and "pixel"
  is how large a dot on the screen is there.

  average() is what a pattern looks like from too far away to see it.

  hash() makes a number which looks random but is the same every time for the same
  spot. noise() is the same, but smooth between the spots.
*/

import { PATTERNS } from "../paint/material.js";

const is = name => `id == ${PATTERNS.indexOf(name)}`;

export const PATTERN_CODE = `
float hash(vec2 spot) {
  vec2 p = fract(spot * vec2(0.1031, 0.1030));

  p += dot(p, p.yx + 33.33);

  return fract((p.x + p.y) * p.x);
}

float noise(vec2 spot) {
  vec2 cell = floor(spot);
  vec2 inside = spot - cell;
  vec2 ease = inside * inside * (3.0 - 2.0 * inside);

  float bottom = mix(hash(cell), hash(cell + vec2(1.0, 0.0)), ease.x);
  float top = mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), ease.x);

  return mix(bottom, top, ease.y);
}

float line(float distance, float width, float pixel) {
  return 1.0 - smoothstep(width - pixel, width + pixel, distance);
}

vec3 panels(vec2 spot, float pixel) {
  vec2 cell = floor(spot);
  vec2 inside = spot - cell;
  vec2 edge = 0.5 - abs(inside - 0.5);
  float split = hash(cell + 3.0);
  float gap = min(edge.x, edge.y);
  float half_ = 0.0;

  if (split < 0.33) {
    gap = min(gap, abs(inside.x - 0.6));
    half_ = step(0.6, inside.x);
  } else if (split < 0.66) {
    gap = min(gap, abs(inside.y - 0.35));
    half_ = step(0.35, inside.y);
  }

  float groove = line(gap, 0.025, pixel);
  float plate = step(0.78, hash(cell + half_ * 0.37 + 11.0));

  return vec3(groove, plate * (1.0 - groove), smoothstep(0.0, 0.07, gap));
}

vec3 rivets(vec2 spot, float pixel) {
  vec2 edge = 0.5 - abs(fract(spot) - 0.5);
  float rivet = length(edge - 0.17);
  float seam = min(edge.x, edge.y);

  float color = max(line(rivet, 0.07, pixel), line(seam, 0.02, pixel));
  float dome = sqrt(max(0.0, 1.0 - rivet * rivet / 0.0064));

  return vec3(color, 0.0, smoothstep(0.0, 0.05, seam) * 0.6 + dome * 0.12);
}

vec3 brushed(vec2 spot) {
  float wide = noise(vec2(spot.x * 1.5, spot.y * 22.0));
  float fine = noise(vec2(spot.x * 4.0, spot.y * 47.0));
  float streak = wide * 0.6 + fine * 0.4;

  return vec3(streak, 0.0, streak * 0.12);
}

vec3 camo(vec2 spot, float pixel) {
  vec2 bent = spot + 0.35 * vec2(noise(spot * 1.7 + 9.0), noise(spot * 1.7 + 4.0));

  float second = noise(bent) * 0.7 + noise(bent * 2.3 + 17.0) * 0.3;
  float third = noise(bent + 51.0) * 0.7 + noise(bent * 2.3 + 31.0) * 0.3;

  return vec3(smoothstep(0.52 - pixel, 0.52 + pixel, second), smoothstep(0.6 - pixel, 0.6 + pixel, third), 0.0);
}

vec3 stripes(vec2 spot, float pixel) {
  float middle = abs(fract((spot.x + spot.y) * 0.5) - 0.5);
  float blur = pixel * 0.7;

  return vec3(smoothstep(0.25 - blur, 0.25 + blur, middle), 0.0, 0.0);
}

vec3 hexes(vec2 spot, float pixel) {
  vec2 grid = vec2(1.0, 1.7320508);
  vec2 even = mod(spot, grid) - grid * 0.5;
  vec2 odd = mod(spot - grid * 0.5, grid) - grid * 0.5;
  vec2 near = abs(dot(even, even) < dot(odd, odd) ? even : odd);
  float edge = 0.5 - max(near.x, dot(near, vec2(0.5, 0.8660254)));

  return vec3(line(edge, 0.05, pixel), 0.0, smoothstep(0.0, 0.12, edge));
}

vec3 grille(vec2 spot, float pixel) {
  float bar = abs(fract(spot.y * 2.0) - 0.5) * 0.5;

  return vec3(line(bar, 0.11, pixel), 0.0, smoothstep(0.06, 0.16, bar));
}

vec3 pattern(int id, vec2 spot, float pixel) {
  if (${is("panels")}) return panels(spot, pixel);
  if (${is("rivets")}) return rivets(spot, pixel);
  if (${is("brushed")}) return brushed(spot);
  if (${is("camo")}) return camo(spot, pixel);
  if (${is("stripes")}) return stripes(spot, pixel);
  if (${is("hex")}) return hexes(spot, pixel);
  if (${is("grille")}) return grille(spot, pixel);

  return vec3(0.0);
}

vec2 average(int id) {
  if (${is("solid")}) return vec2(0.0);
  if (${is("panels")}) return vec2(0.12, 0.2);
  if (${is("rivets")}) return vec2(0.14, 0.0);
  if (${is("camo")}) return vec2(0.45, 0.3);
  if (${is("hex")}) return vec2(0.18, 0.0);

  return vec2(0.5, 0.0);
}

float detail(int id) {
  return ${is("brushed")} ? 12.0 : 1.0;
}
`;
