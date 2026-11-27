/*
  How a socket bends. Without a movement it is fixed.

  The usual ways have a name. "Other" is any axes. A way which is free has no end, such
  as that of a wheel.
*/

import { directions, rulesOf } from "../model/words.js";
import { checkField, el, note, numberInput, selectField, textField } from "./ui.js";

const TURN = [-45, 45];
const MOVE = [-10, 10];
const ROWS = ["turn x", "turn y", "turn z", "move x", "move y", "move z"];

const LABELS = {
  "turn x": "Swing", "turn y": "Spread", "turn z": "Twist",
  "move x": "Left and right", "move y": "Back and forward", "move z": "Down and up"
};

const WAYS = {
  fixed: ["Fixed", {}],
  hinge: ["Hinge", { turn: { x: TURN } }],
  ball: ["Ball", { turn: { x: TURN, y: TURN, z: TURN } }],
  slide: ["Slide", { move: { z: [0, 10] } }],
  spin: ["Spin", { turn: { x: "free" } }],
  free: ["Free", { turn: { x: TURN, y: TURN, z: TURN }, move: { x: MOVE, y: MOVE, z: MOVE } }]
};

export function movementFields(workshop, item) {
  const { id, value } = item;
  const movement = value.movement ?? {};
  const way = wayOf(movement);
  const choices = [...Object.entries(WAYS).map(([key, [label]]) => [key, label]), ["other", "Other"]];
  const choose = selectField("Moves as", way, choices, key => workshop.set(id, { movement: movementAs(key, value) }));

  if (way === "fixed") return [choose];

  const rules = rulesOf(workshop.draft.shape, workshop.session.book);
  const words = directions(movement.name ?? "", rules);

  return [
    choose,
    textField("Joint", movement.name, {
      list: "words-joints", hint: "elbow-left", title: "The name which poses and animations use",
      done: name => workshop.set(id, { movement: { ...movement, name: cleanName(name) || movement.name } })
    }),
    ...ROWS.filter(row => way === "other" || rangeOf(movement, row) !== undefined).map(row => axisRow(workshop, id, movement, row, words[row], way === "other")),
    note("From and to, in degrees or units.")
  ];
}

function axisRow(workshop, id, movement, row, words, isOther) {
  const range = rangeOf(movement, row);
  const isFree = range === "free";
  const change = next => workshop.set(id, { movement: withRange(movement, row, next) });
  const live = (index, number) => workshop.live(id, { movement: withRange(workshop.draft.get(id).value.movement, row, changed(rangeOf(workshop.draft.get(id).value.movement, row), index, number)) });
  const label = words ? [words["-"], words["+"]].filter(Boolean).join(" / ") : LABELS[row];
  const usual = row.startsWith("turn") ? TURN : MOVE;

  return el("div", { className: "joint-axis" },
    el("span", { textContent: words ? `${LABELS[row]}: ${label}` : label }),
    el("div", { className: "limits" },
      isOther ? checkField("", range !== undefined, on => change(on ? usual : undefined)) : null,
      ...Array.isArray(range) ? range.map((number, index) => numberInput(number, {
        key: `${row} ${index}`, step: row.startsWith("turn") ? 5 : 1,
        set: next => live(index, next), done: () => workshop.done()
      })) : [],
      range === undefined ? null : checkField("free", isFree, on => change(on ? "free" : usual), "Has no end")));
}

function movementAs(key, { name, movement }) {
  if (key === "fixed") return {};

  const joint = movement?.name || cleanName(name) || "joint";

  if (key === "other") return { ...movement, name: joint, turn: movement?.turn ?? { x: TURN } };

  return { name: joint, ...structuredClone(WAYS[key][1]) };
}

function wayOf(movement) {
  const kinds = axes => Object.entries(axes ?? {}).map(([axis, range]) => `${axis}${range === "free" ? "!" : ""}`).sort().join();
  const key = ({ turn, move }) => `${kinds(turn)} ${kinds(move)}`;

  if (!movement.name || key(movement) === " ") return "fixed";

  return Object.keys(WAYS).find(way => key(WAYS[way][1]) === key(movement)) ?? "other";
}

function rangeOf(movement, row) {
  const [kind, axis] = row.split(" ");

  return movement[kind]?.[axis];
}

function withRange(movement, row, range) {
  const [kind, axis] = row.split(" ");
  const { [axis]: old, ...others } = movement[kind] ?? {};

  return { ...movement, [kind]: range === undefined ? others : { ...others, [axis]: range } };
}

function changed(range, index, number) {
  return range.map((old, i) => i === index ? number : old);
}

function cleanName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^[^a-z]+|-+$/g, "");
}
