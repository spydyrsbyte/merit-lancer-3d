/*
  A Material is what a surface looks like: up to three colors, and the pattern
  they make. Bright means it ignores shading, as if it were lit from inside.

  Five are standard. Every shape can use them, and they come from the outermost
  shape which has them, so a gun takes on the colors of the mech which carries it.
  Of several which are as far out, it is the one placed first.
*/

import { list, number, text } from "../input/clean.js";

export const PATTERNS = ["solid", "panels", "rivets", "brushed", "camo", "stripes", "hex", "grille"];

const HEX = /^#[0-9a-f]{6}$/i;
const COLORS = ["#5a7f9c", "#39495a", "#c8d0d8"];

export class Material {
  constructor(json = {}, usual = {}) {
    const given = { ...usual, ...json };

    this.name = text(given.name, "Material");
    this.pattern = PATTERNS.includes(given.pattern) ? given.pattern : "solid";
    this.colors = COLORS.map((color, i) => cleanColor(given.colors?.[i], usual.colors?.[i] ?? color));
    this.size = number(given.size, 20, 1, 200);
    this.bump = number(given.bump, 0.5, 0, 1);
    this.bright = given.bright === true;
    this.vary = text(given.vary, "none");
    this.choices = list(given.choices).filter(color => HEX.test(color));
  }
}

const STANDARD = {
  primary: { name: "Primary", colors: ["#5a7f9c"] },
  secondary: { name: "Secondary", colors: ["#c8d0d8"] },
  accent: { name: "Accent", colors: ["#39495a"] },
  metal: { name: "Metal", colors: ["#4a5663"] },
  lights: { name: "Lights", colors: ["#6df0d3"], bright: true }
};

export const STANDARD_NAMES = Object.keys(STANDARD);

export const isStandard = name => Object.hasOwn(STANDARD, name);

export const standard = (name, json) => new Material(json, STANDARD[name]);

export const isColor = value => HEX.test(value);

export function channels(color) {
  const bits = parseInt(color.slice(1), 16);

  return [bits >> 16 & 255, bits >> 8 & 255, bits & 255];
}

function cleanColor(value, fallback) {
  return HEX.test(value) ? value.toLowerCase() : fallback;
}
