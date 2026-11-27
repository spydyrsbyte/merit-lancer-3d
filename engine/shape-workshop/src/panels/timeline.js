/*
  The timeline of the Animation window: a ruler of slices, and a lane for each thing a
  step can do, with a diamond where a step does it.

    Marks      steps with a mark, anywhere in them
    Poses      steps which go to a pose
    Points     steps which move, spawn, despawn, play or glow
    Clock      steps on a millisecond instead of at a slice, placed as if the
               animation went at its usual speed
    joints     one lane for each joint of the shape, where a step moves it

  Clicking the ruler or an empty lane sets the time. Clicking a diamond chooses its step,
  and the joint of its lane, and dragging it moves the whole step to another slice.

  What the editor gives it:
    length, time, steps, chosen (the index of a step), joint, joints (names)
    touches(step)          the names of the joints a step moves
    setTime(slice), choose(index, joint), moveStep(index, slice, isDone)
*/

import { el } from "./ui.js";

const USUAL_SPEED = 0.03;
const DIGITS = 100;
const POINTS = ["to", "spawn", "despawn", "play", "glow", "face", "reach"];

export function timelinePanel(editor) {
  const { length, time } = editor;
  const share = slice => `${Math.max(0, Math.min(1, slice / length)) * 100}%`;
  const lanes = [
    lane("Marks", editor.steps.map((step, index) => ({ index, at: step.at, label: marksOf(step).join(", ") })).filter(one => one.label && one.at !== undefined)),
    lane("Poses", editor.steps.map((step, index) => ({ index, at: step.at, label: step.pose })).filter(one => one.label && one.at !== undefined)),
    lane("Points", editor.steps.map((step, index) => ({ index, at: step.at, label: POINTS.filter(key => key in step).join(", ") })).filter(one => one.label && one.at !== undefined)),
    lane("Clock", editor.steps.map((step, index) => ({ index, at: step.on === undefined ? undefined : step.on * USUAL_SPEED, label: `${step.on} ms` })).filter(one => one.at !== undefined)),
    ...editor.joints.map(joint => lane(joint, editor.steps.map((step, index) => ({ index, at: step.at, label: joint })).filter(one => one.at !== undefined && editor.touches(editor.steps[one.index]).has(joint))))
  ];

  return el("div", { className: "timeline", on: { pointerdown: event => press(editor, event) } },
    el("div", { className: "row ruler" }, el("span", { className: "label", textContent: `Slice ${Math.round(time * DIGITS) / DIGITS} of ${length}` }),
      el("div", { className: "lane", data: { lane: "ruler" } }, ...ticks(length, share), el("span", { className: "head", attributes: { style: `left: ${share(time)}` } }))),
    ...lanes.map(({ name, keys }) => el("div", { className: `row${name === editor.joint ? " current" : ""}` },
      el("span", { className: "label", textContent: name, title: name }),
      el("div", { className: "lane", data: { lane: name } },
        el("span", { className: "head", attributes: { style: `left: ${share(time)}` } }),
        ...keys.map(key => el("span", {
          className: `key${key.index === editor.chosen ? " chosen" : ""}`,
          title: `${key.label} at ${key.at}`,
          data: { index: String(key.index), lane: name },
          attributes: { style: `left: ${share(key.at)}` }
        }))))));
}

function lane(name, keys) {
  return { name, keys };
}

function marksOf(step) {
  const found = [];
  const visit = part => {
    if (part.mark) found.push(part.mark);

    for (const value of Object.values(part)) if (value && typeof value === "object" && !Array.isArray(value)) visit(value);
  };

  visit(step);

  return [...new Set(found)];
}

function ticks(length, share) {
  const every = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(size => length / size <= 12) ?? 1000;
  const found = [];

  for (let at = 0; at <= length; at += every) found.push(el("span", { className: "tick", textContent: String(at), attributes: { style: `left: ${share(at)}` } }));

  return found;
}

function press(editor, event) {
  const lane = event.target.closest(".lane");

  if (!lane || event.button !== 0) return;

  event.preventDefault();

  const box = lane.getBoundingClientRect();
  const sliceAt = point => Math.round(Math.max(0, Math.min(1, (point.clientX - box.left) / box.width)) * editor.length * DIGITS) / DIGITS;
  const key = event.target.closest(".key");
  const home = lane.ownerDocument.defaultView;
  const index = key ? Number(key.dataset.index) : -1;
  const joint = key && editor.joints.includes(key.dataset.lane) ? key.dataset.lane : "";

  if (key) editor.choose(index, joint);
  else editor.setTime(sliceAt(event));

  let isMoved = false;

  const move = now => {
    isMoved = true;

    if (key) editor.moveStep(index, sliceAt(now), false);
    else editor.setTime(sliceAt(now));
  };

  const end = now => {
    home.removeEventListener("pointermove", move);
    home.removeEventListener("pointerup", end);

    if (key && isMoved) editor.moveStep(index, sliceAt(now), true);
  };

  home.addEventListener("pointermove", move);
  home.addEventListener("pointerup", end);
}
