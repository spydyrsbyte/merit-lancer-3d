/*
  The list of what is in the shape, with the buttons to add to it. What is attached to
  something is below it, and can be dragged onto something else. What is attached can be
  folded away under what it is attached to.
*/

import { BUILTINS } from "../../../shape-core/src/index.js";
import { markerKind } from "../view/markers.js";
import { BUILTIN_NAMES } from "../view/placer.js";
import { button, el, heading, iconButton } from "./ui.js";
import { icon } from "./icons.js";

const DRAGGED = "application/x-shape-item";

const SPOTS = {
  joint: "Joint: a place which bends",
  socket: "Socket: where others are attached",
  plug: "Plug: where this shape is held",
  decals: "Decal: where artwork can go"
};

export function treePanel(workshop) {
  const { draft, selection, placer } = workshop;
  const rows = draft.tree;
  const isEmpty = !selection.first;

  return [
    heading("Shapes", el("span", { className: "count", textContent: String(rows.length) })),
    el("div", { className: "add" }, ...builtins(workshop), ...spots(workshop)),
    placer.tool ? el("p", { className: "armed", textContent: "Click where it goes. Shift adds more than one, Escape stops." }) : null,
    el("ol", { className: "parts", data: { scroll: "parts" }, on: { ...dropActions(workshop, null), click: event => event.target === event.currentTarget && workshop.select(null) } },
      ...rows.length ? shown(workshop, rows) : [el("li", { className: "empty", textContent: "Add a shape to begin." })]),
    el("div", { className: "buttons" },
      button("Duplicate", () => workshop.duplicate(), { symbol: "copy", disabled: isEmpty, title: "Ctrl+D" }),
      button("Mirror", () => workshop.mirror(), { symbol: "mirror", disabled: isEmpty, title: "Copy to the other side" }),
      iconButton("trash", "Delete it and everything attached to it", () => workshop.remove(), { disabled: isEmpty })),
    el("div", { className: "buttons" },
      button("Make a shape of it", () => workshop.group(), {
        symbol: "group", disabled: isEmpty,
        title: "What is selected, with everything attached to it, becomes a shape of its own, which can be placed again. Ctrl+click selects more than one."
      }))
  ];
}

function builtins(workshop) {
  return [...BUILTINS.values()].map(shape => {
    const isArmed = workshop.placer.tool?.shape === shape;

    return iconButton(shape.id, `Add a ${BUILTIN_NAMES[shape.id].toLowerCase()}`, () => workshop.arm({ kind: "shape", shape }), { className: isArmed ? "on" : "" });
  });
}

function spots(workshop) {
  return Object.entries(SPOTS).map(([kind, title]) => {
    const isArmed = workshop.placer.tool?.kind === kind;

    return iconButton(kind, title, () => workshop.arm({ kind }), { className: isArmed ? "on" : "" });
  });
}

function shown(workshop, rows) {
  const folded = workshop.folded;
  const visible = [];

  let below = Infinity;

  rows.forEach((row, index) => {
    if (row.depth > below) return;

    below = folded.has(row.id) ? row.depth : Infinity;

    const hasChildren = rows[index + 1]?.depth > row.depth;

    visible.push(treeRow(workshop, row, hasChildren ? folded.has(row.id) : null));
  });

  return visible;
}

function foldButton(workshop, id, isFolded) {
  if (isFolded === null) return el("span", { className: "fold" });

  const title = isFolded ? "Show what is attached" : "Fold away what is attached";

  return el("button", {
    type: "button", className: "fold", textContent: isFolded ? "▸" : "▾", title,
    attributes: { "aria-label": title, "aria-expanded": String(!isFolded) },
    on: {
      click: event => {
        event.stopPropagation();
        workshop.toggleFold(id);
      },
      dblclick: event => event.stopPropagation()
    }
  });
}

function treeRow(workshop, { id, kind, value, depth }, isFolded) {
  const { draft, selection, cutIds } = workshop;
  const classes = ["part", selection.has(id) && "selected", selection.first === id && "first", value.hidden && "off", cutIds.has(id) && "moving"];
  const mark = symbolOf({ kind, value });
  const isLost = draft.missing.includes(value.use);
  const label = value.name || BUILTIN_NAMES[value.use] || draft.thing(id)?.shape?.name || kind;

  return el("li", {
    className: classes.filter(Boolean).join(" "), draggable: true,
    data: { id }, attributes: { style: `--depth: ${depth}` },
    on: {
      click: event => workshop.pickRow(id, event),
      dblclick: () => workshop.desk.enter(id),
      dragstart: event => event.dataTransfer.setData(DRAGGED, id),
      ...dropActions(workshop, id)
    }
  },
  foldButton(workshop, id, isFolded),
  el("span", { className: `name ${markerKind({ kind, value })}` }, icon(mark), el("span", { textContent: label, title: label }), isLost && icon("warning")),
  kind === "shape" && value.cut ? el("span", { className: "cut-mark", title: "Cuts out of the rest" }, icon("cut")) : null,
  kind === "shape" ? iconButton(value.hidden ? "hidden" : "eye", "Show or hide", event => {
    event.stopPropagation();
    workshop.edit(one => one.update(id, { hidden: value.hidden ? undefined : true }));
  }, { className: "toggle" }) : null);
}

function dropActions(workshop, id) {
  return {
    dragover: event => {
      if (event.dataTransfer.types.includes(DRAGGED)) event.preventDefault();
    },
    drop: event => {
      const dragged = event.dataTransfer.getData(DRAGGED);

      if (!dragged) return;

      event.preventDefault();
      event.stopPropagation();

      if (dragged !== id) workshop.attach(dragged, id);
    }
  };
}

function symbolOf({ kind, value }) {
  if (kind !== "shape") return markerKind({ kind, value });

  return BUILTINS.has(value.use) ? value.use : "shape";
}
