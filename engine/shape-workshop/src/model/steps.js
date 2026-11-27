/*
  Steps of an animation, as the editor sees them. They are plain JSON (see core
  motion/animation.js): a step happens at a slice, or on a millisecond, and names
  joints, with what is attached to a joint inside of it.

  A part is a joint in a step, by the keys which lead to it: ["hip01", "knee"] is the
  knee inside of the first hip. What a part says about its joint are amounts, in the
  words of the rules (up, back, bend), in degrees or units, or as a share such as "40%".

  A bend is how far a joint is from where it starts, as a pose has it: turn and move,
  each x, y and z. It becomes words the way the score reads them back (see
  shape-animation's score.js): a word has a direction, and a joint on the mirrored side
  turns the other way around two of its axes.

  The timeline is the animation itself, or one of its definitions by name.
*/

export const ACTIONS = ["at", "on", "play", "glow", "mark", "to", "face", "reach", "size", "spawn", "despawn", "pose"];
export const KINDS = ["turn", "move"];
export const SAME_TIME = 0.01;

const SHARE = /^-?\d+(?:\.\d+)?%$/;
const DIGITS = 10;

export function isAmount(value) {
  return typeof value === "number" || (typeof value === "string" && SHARE.test(value));
}

export function timelineOf(json, scope = "") {
  if (!scope) return json;

  return json.define?.[scope] ?? null;
}

export function partsOf(part, path = []) {
  const found = [];

  for (const [key, value] of Object.entries(part)) {
    if (ACTIONS.includes(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;

    found.push({ path: [...path, key], part: value }, ...partsOf(value, [...path, key]));
  }

  return found;
}

export function partOf(step, path) {
  return path.reduce((part, key) => part?.[key], step) ?? null;
}

export function amountsOf(part) {
  return Object.fromEntries(Object.entries(part ?? {}).filter(([key, value]) => !ACTIONS.includes(key) && isAmount(value)));
}

export function stepAt(steps, at) {
  return (steps ?? []).findIndex(step => step.on === undefined && Math.abs((step.at ?? 0) - at) < SAME_TIME);
}

export function sortSteps(steps) {
  steps.sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.on ?? 0) - (b.on ?? 0));
}

export function wordsOf(rules, joint) {
  const [first] = joint.split("-");
  const convention = first.replace(/\d+$/, "");
  const words = Object.keys(rules?.movements[convention] ?? {});

  return words.map(word => ({ word, ...rules.direction(joint, word) })).filter(one => one.kind);
}

export function bendInWords(rules, joint, bend, kept = {}) {
  const words = wordsOf(rules, joint);
  const found = {};

  for (const kind of KINDS) {
    for (const axis of [0, 1, 2]) {
      const value = bend[kind]?.[axis] ?? 0;
      const choices = words.filter(one => one.kind === kind && one.axis === axis);
      const wasThere = choices.some(({ word }) => word in kept);

      if (!choices.length || (Math.abs(value) < 1 / DIGITS && !wasThere)) continue;

      const ways = choices.map(one => ({ word: one.word, amount: value / (one.sign * sideOf(rules, joint, kind, axis)) }));
      const best = ways.find(one => one.amount >= 0) ?? ways[0];

      found[best.word] = Math.round(best.amount * DIGITS) / DIGITS;
    }
  }

  return found;
}

export function writeBend(part, rules, joint, bend) {
  const known = new Set(wordsOf(rules, joint).map(({ word }) => word));
  const kept = {};

  for (const key of Object.keys(part)) {
    if (!known.has(key) || !isAmount(part[key])) continue;

    kept[key] = part[key];
    delete part[key];
  }

  Object.assign(part, bendInWords(rules, joint, bend, kept));
}

export function setAmount(part, word, text) {
  const trimmed = String(text ?? "").trim();

  if (!trimmed) {
    delete part[word];

    return;
  }

  part[word] = SHARE.test(trimmed) ? trimmed : Number(trimmed);
}

export function nameWords(name) {
  return name.split("-").map(word => word.replace(/\d+$/, ""));
}

function sideOf(rules, joint, kind, axis) {
  const turnsAway = kind === "turn" ? axis > 0 : axis === 0;

  return turnsAway && rules.isMirrored(joint) ? -1 : 1;
}
