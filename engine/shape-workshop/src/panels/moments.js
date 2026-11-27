/*
  The panel of the step which is chosen in the Animation window: everything a step can
  say (see core motion/animation.js).

    when      at a slice, or on a millisecond
    mark      the name of a moment, for the game
    pose      a pose of the shape to go to
    to        a point to move to
    despawn   what was spawned, and is gone
    spawn     shapes which appear: a name, the shape, the socket it is at, and whether
              it stays attached
    play      definitions or other animations, by name or id: at, and a weight for a
              chance; of those with the same at, one is picked
    glow      what shines: a joint, a socket or a placement, with a color, strength
              and reach, and whether only bright surfaces shine

  For the joint which is chosen, each part of the step which moves it: its amounts in
  the words of the rules, as degrees, units or a share such as "40%", and face, reach,
  size, mark, glow and play, which a joint can have as well. A part can mean more than
  one joint, such as "knee", which is every knee.

  The step is also shown as JSON, and can be changed there, which is everything.

  What the editor gives it:
    step, time, joint, poses, points, spawned, definitions, wordsFor(joint),
    partsFor(joint) as { path, part, joints }
    edit(action)   changes the step, as one step of undo: action(step)
    removeStep(), copyStep(), addPart(joint)
*/

import { setAmount } from "../model/steps.js";
import { button, checkField, el, heading, iconButton, note, select, textField } from "./ui.js";

const USUAL_SPEED = 0.03;
const SLICE = "at";
const CLOCK = "on";

export function momentPanel(editor) {
  const { step } = editor;

  if (!step) return [];

  return [
    heading("Step"),
    whenRow(editor),
    textField("Mark", step.mark ?? "", { key: "step mark", hint: "fire, hit, end…", done: text => editor.edit(one => setText(one, "mark", text)) }),
    labelled("Pose", select(step.pose ?? "", [["", "None"], ...editor.poses.map(name => [name, name])], value => editor.edit(one => setText(one, "pose", value)), "step pose")),
    textField("Move to", typeof step.to === "string" ? step.to : "", { key: "step to", list: "animation-points", hint: "points.target", done: text => editor.edit(one => setText(one, "to", text)) }),
    labelled("Despawn", select(step.despawn ?? "", [["", "None"], ...editor.spawned.map(name => [name, name])], value => editor.edit(one => setText(one, "despawn", value)), "step despawn")),
    spawnRows(editor),
    playRows(editor, []),
    glowRows(editor, []),
    ...jointParts(editor),
    heading("As JSON"),
    jsonBox(editor),
    el("div", { className: "buttons" },
      button("Copy to now", () => editor.copyStep(), { symbol: "copy", title: "A copy of this step at the slice which is shown" }),
      button("Delete step", () => editor.removeStep(), { symbol: "trash" }))
  ];
}

function whenRow(editor) {
  const { step } = editor;
  const kind = step.on === undefined ? SLICE : CLOCK;
  const value = step[kind] ?? 0;

  const switchTo = next => editor.edit(one => {
    if (next === kind) return;

    if (next === CLOCK) one.on = Math.round((one.at ?? 0) / USUAL_SPEED);
    else one.at = Math.round((one.on ?? 0) * USUAL_SPEED * 100) / 100;

    delete one[kind];
  });

  return el("div", { className: "field row" },
    select(kind, [[SLICE, "At slice"], [CLOCK, "On millisecond"]], switchTo, "step when"),
    numberBox(value, "step time", number => editor.edit(one => {
      one[kind] = Math.max(0, number ?? 0);
    }), "When it happens"));
}

function spawnRows(editor) {
  const spawns = Object.entries(editor.step.spawn ?? {});

  const change = (name, values) => editor.edit(one => {
    one.spawn = { ...one.spawn, [name]: { ...one.spawn?.[name], ...values } };
  });

  const rename = (name, next) => editor.edit(one => {
    if (!next || next === name) return;

    const { [name]: kept, ...others } = one.spawn;

    one.spawn = { ...others, [next]: kept };
  });

  const remove = name => editor.edit(one => {
    const { [name]: gone, ...others } = one.spawn ?? {};

    if (Object.keys(others).length) one.spawn = others;
    else delete one.spawn;
  });

  const rows = spawns.map(([name, spawn]) => el("div", { className: "group" },
    textField("Spawn", name, { key: `spawn ${name}`, done: text => rename(name, text) }),
    textField("Shape", spawn.use ?? "", { key: `spawn ${name} use`, hint: "id of a shape", list: "animation-shapes", done: text => change(name, { use: text }) }),
    textField("At", spawn.at ?? "", { key: `spawn ${name} at`, hint: "socket, such as muzzle", done: text => change(name, { at: text || undefined }) }),
    checkField("Stays attached", spawn.attached === true, on => change(name, { attached: on || undefined })),
    iconButton("trash", "Remove", () => remove(name))));

  return el("div", { className: "list" }, ...rows, button("Spawn a shape", () => editor.edit(one => {
    const taken = new Set(Object.keys(one.spawn ?? {}));
    let count = taken.size + 1;

    while (taken.has(`spawn${count}`)) count++;

    one.spawn = { ...one.spawn, [`spawn${count}`]: { use: "", at: "" } };
  }), { symbol: "plus" }));
}

function playRows(editor, path) {
  const target = part => path.reduce((inner, key) => inner[key], part);
  const plays = target(editor.step).play ?? [];

  const change = (index, values) => editor.edit(one => {
    const part = target(one);

    part.play = part.play.map((play, i) => i === index ? clean({ ...play, ...values }) : play);
  });

  const remove = index => editor.edit(one => {
    const part = target(one);

    part.play = part.play.filter((play, i) => i !== index);

    if (!part.play.length) delete part.play;
  });

  const rows = plays.map((play, index) => el("div", { className: "group row" },
    textField("Play", play.use ?? "", { key: `play ${path.join(" ")} ${index}`, list: "animation-definitions", done: text => change(index, { use: text }) }),
    labelled("At", numberBox(play.at ?? 0, `play at ${path.join(" ")} ${index}`, number => change(index, { at: number || undefined }))),
    labelled("Weight", numberBox(play.weight, `play weight ${path.join(" ")} ${index}`, number => change(index, { weight: number }), "Empty: it always plays")),
    iconButton("trash", "Remove", () => remove(index))));

  return el("div", { className: "list" }, ...rows, button("Play a definition", () => editor.edit(one => {
    const part = target(one);

    part.play = [...part.play ?? [], { use: editor.definitions[0] ?? "", at: 0 }];
  }), { symbol: "plus" }));
}

function glowRows(editor, path) {
  const target = part => path.reduce((inner, key) => inner[key], part);
  const glows = Object.entries(target(editor.step).glow ?? {});

  const change = (name, values) => editor.edit(one => {
    const part = target(one);

    part.glow = { ...part.glow, [name]: clean({ ...part.glow?.[name], ...values }) };
  });

  const rename = (name, next) => editor.edit(one => {
    const part = target(one);

    if (!next || next === name) return;

    const { [name]: kept, ...others } = part.glow;

    part.glow = { ...others, [next]: kept };
  });

  const remove = name => editor.edit(one => {
    const part = target(one);
    const { [name]: gone, ...others } = part.glow ?? {};

    if (Object.keys(others).length) part.glow = others;
    else delete part.glow;
  });

  const rows = glows.map(([name, glow]) => el("div", { className: "group" },
    textField("Glow on", name, { key: `glow ${path.join(" ")} ${name}`, hint: "joint, socket or placement", done: text => rename(name, text) }),
    el("div", { className: "field row" },
      el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(glow.color ?? "") ? glow.color : "#ffd27a", on: { change: event => change(name, { color: event.target.value }) } }),
      labelled("Strength", numberBox(glow.strength ?? 1, `glow strength ${path.join(" ")} ${name}`, number => change(name, { strength: number ?? 0 }))),
      labelled("Reach", numberBox(glow.reach ?? 6, `glow reach ${path.join(" ")} ${name}`, number => change(name, { reach: number ?? 0 })))),
    checkField("Only bright surfaces", glow.bright === true, on => change(name, { bright: on || undefined })),
    iconButton("trash", "Remove", () => remove(name))));

  return el("div", { className: "list" }, ...rows, button("Glow", () => editor.edit(one => {
    const part = target(one);

    part.glow = { ...part.glow, [editor.joint || "lights"]: { color: "#ffd27a", strength: 1, reach: 6 } };
  }), { symbol: "plus" }));
}

function jointParts(editor) {
  const { joint } = editor;

  if (!joint) return [note("Choose a joint, in the view or in its lane, to see what this step does with it.")];

  const parts = editor.partsFor(joint);
  const exact = parts.some(({ joints }) => joints.length === 1);

  return [
    heading(joint),
    ...parts.map(found => partBox(editor, found)),
    exact ? null : button(`Move ${joint} in this step`, () => editor.addPart(joint), { symbol: "plus" })
  ];
}

function partBox(editor, { path, part, joints }) {
  const words = editor.wordsFor(editor.joint);
  const target = step => path.reduce((inner, key) => inner[key], step);
  const others = joints.filter(name => name !== editor.joint);
  const face = part.face;
  const facePoint = typeof face === "string" ? face : Object.keys(face ?? {})[0] ?? "";
  const faceDegrees = typeof face === "object" && face ? face[facePoint] : undefined;

  const setFace = (point, degrees) => editor.edit(one => {
    const inner = target(one);

    if (!point) delete inner.face;
    else inner.face = degrees === undefined ? point : { [point]: degrees };
  });

  return el("div", { className: "group part" },
    el("p", { className: "path", textContent: path.join(" › ") }),
    others.length ? note(`This also moves ${others.join(", ")}.`) : null,
    ...words.map(({ word }) => textField(word, part[word] === undefined ? "" : String(part[word]), {
      key: `${path.join(" ")} ${word}`, hint: "degrees, or a share such as 40%",
      done: text => editor.edit(one => setAmount(target(one), word, text))
    })),
    el("div", { className: "field row" },
      textField("Face", facePoint, { key: `${path.join(" ")} face`, list: "animation-points", done: text => setFace(text, faceDegrees) }),
      labelled("Degrees", numberBox(faceDegrees, `${path.join(" ")} face degrees`, number => setFace(facePoint, number), "To the side of the point, or away from it below 0. Empty: all the way"))),
    textField("Reach", typeof part.reach === "string" ? part.reach : "", { key: `${path.join(" ")} reach`, list: "animation-points", done: text => editor.edit(one => setText(target(one), "reach", text)) }),
    textField("Size", Array.isArray(part.size) ? part.size.join(", ") : part.size ?? "", { key: `${path.join(" ")} size`, hint: "1, 1, 1", done: text => editor.edit(one => setSize(target(one), text)) }),
    textField("Mark", part.mark ?? "", { key: `${path.join(" ")} mark`, done: text => editor.edit(one => setText(target(one), "mark", text)) }),
    glowRows(editor, path),
    playRows(editor, path),
    button("Remove this part", () => editor.edit(one => removePart(one, path)), { symbol: "trash" }));
}

function jsonBox(editor) {
  const text = JSON.stringify(editor.step, null, 2);
  const box = el("textarea", { className: "json", value: text, spellcheck: false, rows: Math.min(18, text.split("\n").length + 1), data: { key: "step json" } });

  box.addEventListener("change", () => {
    try {
      const json = JSON.parse(box.value);

      editor.edit(one => {
        for (const key of Object.keys(one)) delete one[key];

        Object.assign(one, json);
      });
    } catch (error) {
      editor.say(`That is not JSON: ${error.message}`);
    }
  });

  return box;
}

function numberBox(value, key, apply, title = "") {
  const input = el("input", { type: "number", step: "any", value: value ?? "", title, data: { key } });

  input.addEventListener("change", () => {
    const text = input.value.trim();
    const number = Number(text);

    if (text && Number.isNaN(number)) return;

    apply(text ? number : undefined);
  });

  return input;
}

function labelled(text, control) {
  return el("label", { className: "field" }, el("span", { textContent: text }), control);
}

function setText(part, key, text) {
  if (text) part[key] = text;
  else delete part[key];
}

function setSize(part, text) {
  const numbers = text.split(/[,\s]+/).filter(Boolean).map(Number);

  if (!numbers.length || numbers.some(Number.isNaN)) delete part.size;
  else part.size = numbers.length === 1 ? [numbers[0], numbers[0], numbers[0]] : numbers.slice(0, 3);
}

function removePart(step, path) {
  const outer = path.slice(0, -1).reduce((inner, key) => inner[key], step);

  delete outer[path.at(-1)];
}

function clean(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== "" && !Number.isNaN(value)));
}

