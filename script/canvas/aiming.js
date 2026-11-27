/*
  How a mech aims, as merit-mech-workshop's model/aim.mjs did it: what carries the
  weapon turns as far as it can, and the whole mech does the rest.

  The joints from the weapon to the body which are a turret, a waist or a pelvis turn
  toward the target, each as far as its movement lets it, the first ones first. What is
  left is how far the whole mech turns (body). The head looks at the target, whatever it
  hangs on. To aim up or down, the turret, or else the shoulder, is raised.

  The weapon is what is at a place, such as "hand-right". Without one it is the right
  shoulder, a turret or the waist.

  Yaw is degrees counter-clockwise from where the mech faces, pitch degrees up. Turns
  around z are left and right, around x up and down, as the rules of mecha have them.
*/

import { Pose } from "../../engine/shape-core/src/index.js";

const TURNING = new Set(["turret", "waist", "pelvis"]);
const RAISING = ["turret", "shoulder"];
const YAW = 2;
const PITCH = 0;
const AXES = ["x", "y", "z"];

export function shareAim(figure, { yaw, pitch = 0, place = "" }) {
  const bends = new Map();
  const arm = armOf(figure, place);
  const chain = arm ? chainOf(arm) : [];

  const set = (piece, axis, wanted) => {
    const value = limited(piece, axis, wanted);

    if (!value) return 0;

    const bend = bends.get(piece.name) ?? { turn: [0, 0, 0], move: [0, 0, 0] };

    bend.turn[axis] = value;
    bends.set(piece.name, bend);

    return value;
  };

  let left = yaw;

  for (const piece of chain) if (TURNING.has(wordOf(piece))) left -= set(piece, YAW, left);

  for (const head of figure.pieces.filter(piece => wordOf(piece) === "head")) {
    const turned = chainOf(head).slice(1).reduce((sum, piece) => sum + (bends.get(piece.name)?.turn[YAW] ?? 0), left);

    set(head, YAW, yaw - turned);
  }

  if (pitch) {
    for (const word of RAISING) {
      const piece = chain.find(one => wordOf(one) === word);

      if (piece && set(piece, PITCH, pitch)) break;
    }
  }

  return { body: left, pose: new Pose(bends) };
}

function armOf(figure, place) {
  const socket = place ? figure.sockets.find(one => one.name === place) : null;
  const holder = socket?.piece ?? null;
  const named = word => figure.pieces.find(piece => piece.name === word) ?? figure.pieces.find(piece => wordOf(piece) === word);

  return jointOf(holder) ?? named("shoulder-right") ?? named("turret") ?? named("waist") ?? null;
}

function jointOf(piece) {
  let found = piece;

  while (found && !found.movement) found = found.parent;

  return found;
}

function chainOf(piece) {
  const chain = [];

  for (let one = piece; one; one = one.parent) if (one.movement) chain.push(one);

  return chain;
}

function wordOf(piece) {
  return (piece.name.split("-")[0] ?? "").replace(/\d+$/, "");
}

function limited(piece, axis, wanted) {
  const range = piece.movement?.turn[AXES[axis]];

  if (!range) return 0;
  if (range === "free") return wanted;

  const [low, high] = range;

  return Math.max(Math.min(low, 0), Math.min(Math.max(high, 0), wanted));
}
