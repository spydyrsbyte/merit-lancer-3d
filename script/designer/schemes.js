/*
  Ready-made colors for the five standard materials of every mech, as the Mech Designer
  of merit-mech-workshop had them: primary, secondary, accent, metal and lights (which
  was called glow there).

  When the first color of a material changes, patterns which are shades of one color
  get their other colors as shades of the new one. They can be changed afterwards.

  Patterns use one, two or three colors.
*/

export const SCHEMES = {
  sandstone: ["#c4b189", "#dcd6c6", "#2f5b63", "#6d747a", "#ffb347"],
  olive: ["#5d6645", "#8c8a68", "#33392c", "#5c5f55", "#ffcf5c"],
  arctic: ["#d9dee2", "#aeb9c2", "#3b6ea5", "#7d8790", "#7fd4ff"],
  navy: ["#2f4668", "#b9c2cc", "#c9902f", "#5b6572", "#8fd8ff"],
  rust: ["#7a3f31", "#c2a07e", "#2b2624", "#78706a", "#ff8f45"],
  crimson: ["#8e2430", "#e0d6c8", "#26272c", "#6b6d72", "#ffd36b"],
  jungle: ["#3f5c46", "#a99f78", "#24312a", "#5f665e", "#b6f06a"],
  violet: ["#4a3f66", "#b5aec4", "#8fe0c0", "#5d5a68", "#8affc9"],
  graphite: ["#3a3f45", "#6e757c", "#d0622b", "#565c62", "#ff7a3d"],
  hazard: ["#d8a52c", "#2b2d30", "#4b4e52", "#6f7377", "#fff2a8"],
  ivory: ["#e4ded0", "#b79a5b", "#58707a", "#8b8f8f", "#ffe08a"],
  teal: ["#43686c", "#9fb3ae", "#7d3029", "#5c686b", "#ffab3d"]
};

export const SCHEME_NAMES = ["primary", "secondary", "accent", "metal", "lights"];

export const PATTERN_COLORS = { solid: 1, panels: 3, rivets: 2, brushed: 2, camo: 3, stripes: 2, hex: 2, grille: 2 };

const SHADED = new Set(["solid", "panels", "rivets", "brushed", "hex", "grille"]);
const DARKER = 0.32;
const LIGHTER = 0.12;

export function colorsFor(material, color) {
  if (!SHADED.has(material.pattern)) return [color, ...material.colors.slice(1)];

  return [color, mix(color, "#000000", DARKER), mix(color, "#ffffff", LIGHTER)];
}

function mix(color, other, amount) {
  const [a, b] = [color, other].map(one => [1, 3, 5].map(start => parseInt(one.slice(start, start + 2), 16)));

  return `#${a.map((number, i) => Math.round(number + amount * (b[i] - number)).toString(16).padStart(2, "0")).join("")}`;
}
