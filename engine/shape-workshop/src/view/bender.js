/*
  The Bender bends joints by dragging a limb in a view, for the Poses and Animation
  windows alike: the point which was grabbed follows the pointer. How that point moves
  with each axis of the joint is measured, and the steps are found which bring it
  closest, never more than FASTEST at once, and within how far the joint can go.

  Bends are how far each joint is from where it starts: { turn: [x, y, z], move: [...] }.
  Whoever drags says what they are now, and is told the new one of the joint.
*/

import { Pose } from "../../../shape-core/src/index.js";

export const FREE = { turn: [-180, 180], move: [-100, 100] };

const AXES = ["x", "y", "z"];
const STILL = [0, 0, 0];
const FASTEST = 15;
const EVEN = 0.02;
const DIGITS = 10;

export function grabLimb(view, at, { bends, set, moved = () => null, done = () => null }) {
  const hit = view.pick(at);
  const piece = hit && bendable(hit.piece);

  if (!piece) return null;

  const held = piece.base.inverse.point(hit.point);

  let last = at;

  return {
    move: now => {
      pull(view, bends(), piece, held, [now[0] - last[0], now[1] - last[1]], set);
      last = now;
      moved(piece.name);
    },
    end: isMoved => done(isMoved)
  };
}

export function bendable(piece) {
  let found = piece;

  while (found && !found.movement) found = found.parent;

  return found;
}

export function axesOf(movement) {
  return ["turn", "move"].flatMap(kind => Object.entries(movement[kind]).map(([axis, range]) => {
    const [low, high] = range === "free" ? FREE[kind] : [Math.min(range[0], 0), Math.max(range[1], 0)];

    return { kind, axis, low, high };
  }));
}

function pull(view, bends, { name, movement }, held, [right, down], set) {
  const index = view.figure.pieces.findIndex(piece => piece.name === name);
  const { turn = STILL, move = STILL } = bends[name] ?? {};
  const now = { turn: [...turn], move: [...move] };

  const seen = bend => {
    const { figure } = view;

    figure.take(Pose.read({ ...bends, [name]: bend }));

    return view.project(figure.pieces[index].base.point(held));
  };

  const start = seen(now);

  const slopes = axesOf(movement).map(({ kind, axis, low, high }) => {
    const i = AXES.indexOf(axis);
    const next = structuredClone(now);

    next[kind][i] += next[kind][i] + 1 > high ? -1 : 1;

    const sign = next[kind][i] > now[kind][i] ? 1 : -1;
    const end = seen(next);

    return { kind, i, low, high, across: (end[0] - start[0]) * sign, along: (end[1] - start[1]) * sign };
  });

  const step = solve(slopes, right, down);

  for (const { kind, i, low, high, across, along } of slopes) {
    const amount = across * step[0] + along * step[1];
    const wanted = now[kind][i] + Math.max(-FASTEST, Math.min(FASTEST, amount));

    now[kind][i] = Math.round(Math.max(low, Math.min(high, wanted)) * DIGITS) / DIGITS;
  }

  set(name, now);
}

function solve(slopes, right, down) {
  let a = EVEN;
  let b = 0;
  let d = EVEN;

  for (const { across, along } of slopes) {
    a += across * across;
    b += across * along;
    d += along * along;
  }

  const size = a * d - b * b;

  return [(d * right - b * down) / size, (a * down - b * right) / size];
}
