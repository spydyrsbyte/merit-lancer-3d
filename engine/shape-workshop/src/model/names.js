/*
  Names: one which is not taken yet, and the name of the same thing on the other side.
*/

const OTHER = { left: "right", right: "left", Left: "Right", Right: "Left", L: "R", R: "L" };
const SIDE = /(?<![A-Za-z])(left|right|Left|Right|L|R)(?![A-Za-z])/g;
const COUNTED = /^(.*?)(\d*)$/;
const DIGITS = 2;

export function otherSide(name) {
  return name.replace(SIDE, word => OTHER[word]);
}

export function freeName(name, taken) {
  if (!taken.has(name)) return name;

  const [, base] = COUNTED.exec(name);

  for (let count = 2; ; count++) {
    const next = base + String(count).padStart(DIGITS, "0");

    if (!taken.has(next)) return next;
  }
}

export function fileName(name) {
  const plain = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return plain || "shape";
}
