/*
  Shapes come from files, links and other people, so nothing in them is trusted.
  These take any value and give back a usable one.
*/

const LONGEST = 100;
const LONGEST_PATH = 5000;

export function number(value, fallback, low = -10000, high = 10000) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.max(low, Math.min(high, value));
}

export function vector(value, fallback, low, high) {
  if (!Array.isArray(value)) return [...fallback];

  return fallback.map((usual, axis) => number(value[axis], usual, low, high));
}

export function text(value, fallback, longest = LONGEST) {
  if (typeof value !== "string") return fallback;

  return value.trim().slice(0, longest) || fallback;
}

export function path(value) {
  return text(value, "", LONGEST_PATH);
}

export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function words(value) {
  const all = Array.isArray(value) ? value : [value];

  return [...new Set(all.filter(word => typeof word === "string" && word))];
}

export function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return value;
}
