/*
  The Gizmo is the handles on what is selected, to move, turn or size it. Right is red,
  forward is green and up is blue, as in the properties.

  It works on a target: the ground its position is measured from, its position and
  rotation, and its size if it has one. Dragging gives new values, and what is done
  with them is up to whoever uses it.

  Moving goes along the axes of the ground, so an arrow changes the number of the same
  color. Turning and sizing go by the axes of the thing itself.

  What is attached by a side is sized from there. Anything else grows both ways, so it
  grows twice as fast and stays under the pointer.

  Values snap to steps, unless Alt is held.
*/

import { dot, Turn } from "../../../shape-core/src/index.js";

export const MODES = { move: "Move", turn: "Turn", size: "Size" };

const COLORS = ["#ff6b5e", "#7bd86a", "#6aa8ff"];
const LENGTH = 72;
const REACH = 9;
const KNOB = 5;
const RING_STEPS = 48;
const CIRCLE = Math.PI * 2;
const DEGREES = 180 / Math.PI;
const SIDEWAYS = 0.15;

const UNITS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const MOVE_STEP = 0.5;
const TURN_STEP = 5;
const SMALLEST = 0.1;
const SMALLEST_TIMES = 0.05;
const DIGITS = 100;

export class Gizmo {
  #view;

  constructor(view) {
    this.#view = view;
    this.mode = "move";
  }

  draw(context, target) {
    const { ratio } = this.#view;

    for (const { axis, points } of this.#handles(target)) {
      context.strokeStyle = COLORS[axis];
      context.fillStyle = COLORS[axis];
      context.lineWidth = 2.5 * ratio;

      context.beginPath();
      points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
      context.stroke();

      if (this.mode === "turn") continue;

      const [x, y] = points.at(-1);
      const size = KNOB * ratio;

      context.beginPath();

      if (this.mode === "move") context.arc(x, y, size, 0, CIRCLE);
      else context.rect(x - size, y - size, size * 2, size * 2);

      context.fill();
    }
  }

  grab(at, target) {
    const reach = REACH * this.#view.ratio;
    const near = this.#handles(target).map(handle => ({ ...handle, far: farFrom(at, handle.points) }));
    const [best] = near.filter(({ far }) => far < reach).sort((a, b) => a.far - b.far);

    if (!best) return null;

    const center = this.#view.project(centerOf(target));

    return (now, isFree) => this.#values(best, { at, center, target }, now, isFree);
  }

  #axes({ ground, rotation }) {
    if (this.mode === "move") return UNITS.map(unit => ground.rigid.direction(unit));

    const turn = ground.turn.times(Turn.degrees(rotation));

    return UNITS.map(unit => turn.apply(unit));
  }

  #handles(target) {
    if (this.mode === "size" && !target.size) return [];

    const center = centerOf(target);
    const axes = this.#axes(target);
    const length = LENGTH * this.#view.ratio / this.#view.unit;
    const handles = axes.map((direction, axis) => this.#handle(center, axes, direction, axis, length));

    return this.mode === "turn" ? handles : handles.filter(handle => this.#isSeen(handle));
  }

  #handle(center, axes, direction, axis, length) {
    const line = this.mode === "turn" ? ring(center, axes, axis, length) : [center, along(center, direction, length)];

    return { axis, direction, length, points: line.map(point => this.#view.project(point)) };
  }

  #isSeen({ direction }) {
    const depth = dot(direction, this.#view.toward);

    return Math.sqrt(Math.max(0, 1 - depth * depth)) > SIDEWAYS;
  }

  #values(handle, start, now, isFree) {
    if (this.mode === "turn") return turned(handle, start, now, this.#view.toward, isFree);

    const pulled = this.#pulled(handle, start, now);

    if (this.mode === "move") return moved(start.target, handle.axis, pulled, isFree);

    return sized(start.target, handle.axis, pulled, isFree);
  }

  #pulled({ direction, length }, { at, center, target }, now) {
    const tip = this.#view.project(along(centerOf(target), direction, length));
    const arrow = [tip[0] - center[0], tip[1] - center[1]];
    const size = Math.hypot(...arrow) || 1;

    return ((now[0] - at[0]) * arrow[0] + (now[1] - at[1]) * arrow[1]) / (size * size) * length;
  }
}

function centerOf({ ground, position }) {
  return ground.point(position);
}

function moved({ ground, position }, axis, pulled, isFree) {
  const amount = snapped(pulled / ground.lengths[axis], MOVE_STEP, isFree);

  return { position: position.map((number, i) => i === axis ? tidy(number + amount) : number) };
}

function sized({ size, natural, growth, isTimes }, axis, pulled, isFree) {
  const step = isTimes ? SMALLEST_TIMES : MOVE_STEP;
  const smallest = isTimes ? SMALLEST_TIMES : SMALLEST;
  const amount = snapped(pulled * growth[axis] / natural[axis], step, isFree);

  return { size: size.map((number, i) => i === axis ? Math.max(smallest, tidy(number + amount)) : number) };
}

function turned({ axis, direction }, { at, center, target }, now, toward, isFree) {
  const from = Math.atan2(at[1] - center[1], at[0] - center[0]);
  const to = Math.atan2(now[1] - center[1], now[0] - center[0]);
  const side = dot(direction, toward) < 0 ? -1 : 1;
  const degrees = snapped(wrapped((to - from) * DEGREES) * side, TURN_STEP, isFree);
  const turn = Turn.degrees(target.rotation).times(Turn.around(UNITS[axis], degrees));

  return { rotation: turn.degrees.map(tidy) };
}

function snapped(amount, step, isFree) {
  return isFree ? amount : Math.round(amount / step) * step;
}

function ring(center, axes, axis, radius) {
  const first = axes[(axis + 1) % 3];
  const second = axes[(axis + 2) % 3];

  return Array.from({ length: RING_STEPS + 1 }, (_, step) => {
    const angle = step / RING_STEPS * CIRCLE;

    return along(along(center, first, Math.cos(angle) * radius), second, Math.sin(angle) * radius);
  });
}

function along(point, direction, amount) {
  return point.map((number, i) => number + direction[i] * amount);
}

function farFrom(point, line) {
  const distances = line.slice(1).map((end, i) => farFromPiece(point, line[i], end));

  return Math.min(...distances);
}

function farFromPiece([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const amount = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));

  return Math.hypot(x - ax - dx * amount, y - ay - dy * amount);
}

function wrapped(degrees) {
  return (degrees + 540) % 360 - 180;
}

function tidy(number) {
  return Math.round(number * DIGITS) / DIGITS || 0;
}
