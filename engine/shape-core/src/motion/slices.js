/*
  Animations of version 1 counted in seconds. They are read with this many slices to a
  second, which is also how fast an animation goes unless it is told otherwise.

  Their stride is left behind: how far a walk goes is now in its slices.
*/

import { list, record } from "../input/clean.js";

export const SLICES_PER_SECOND = 30;

export function inSlices(json, { major }) {
  const version = record(json.version).major ?? major;

  if (version >= 2) return json;

  const define = Object.entries(record(json.define)).map(([name, one]) => [name, inSlicesDefined(record(one))]);

  return { ...json, length: sliced(json.length ?? 1), define: Object.fromEntries(define), steps: list(json.steps).map(inSlicesStep) };
}

function inSlicesDefined(json) {
  return { ...json, length: sliced(json.length ?? 1), steps: list(json.steps).map(inSlicesStep) };
}

function inSlicesStep(step) {
  const plain = record(step);

  return { ...plain, at: sliced(plain.at ?? 0), ...withPlays(plain) };
}

function withPlays(part) {
  const inner = Object.entries(part).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value));
  const played = Array.isArray(part.play) ? { play: part.play.map(one => ({ ...one, ...one.at !== undefined ? { at: sliced(one.at) } : {} })) } : {};

  return { ...played, ...Object.fromEntries(inner.filter(([key]) => !["glow", "spawn", "face", "define"].includes(key)).map(([key, value]) => [key, { ...value, ...withPlays(value) }])) };
}

function sliced(seconds) {
  return typeof seconds === "number" ? Math.round(seconds * SLICES_PER_SECOND * 1000) / 1000 : seconds;
}
