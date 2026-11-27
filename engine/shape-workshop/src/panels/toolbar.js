/*
  The bar on top: the tabs of the open shapes, the name of the current one, and the
  windows.
*/

import { MODES } from "../view/gizmo.js";
import { button, el, field, iconButton, textField } from "./ui.js";

export function toolbarPanel(workshop) {
  const { draft } = workshop;

  return [
    el("div", { className: "line" }, tabs(workshop), fileButtons(workshop)),
    draft ? el("div", { className: "line" }, ...shapeTools(workshop)) : null
  ];
}

function tabs(workshop) {
  const { session } = workshop;

  const all = session.tabs.map(draft => {
    const isCurrent = draft === session.current;

    return el("div", { className: `tab${isCurrent ? " current" : ""}`, title: workshop.desk.files.pathOf(draft) ?? "Not saved yet" },
      el("button", { type: "button", className: "label", on: { click: () => workshop.desk.show(draft) } },
        el("span", { textContent: draft.name }),
        draft.isSaved ? null : el("span", { className: "dirty", textContent: "●", title: "Unsaved changes" })),
      iconButton("close", "Close", () => workshop.desk.close(draft)));
  });

  return el("nav", { className: "tabs" }, ...all);
}

function fileButtons(workshop) {
  const { draft } = workshop;

  return el("div", { className: "buttons" },
    button("New", () => workshop.desk.start(), { symbol: "file", title: "Ctrl+N" }),
    button("Open", () => workshop.desk.openFiles(), { symbol: "open", title: "Ctrl+O" }),
    button("Save", () => workshop.desk.save(), { symbol: "save", title: "Ctrl+S", disabled: !draft, className: draft && !draft.isSaved ? "main" : "" }),
    button("Save as", () => workshop.desk.save(true), { title: "Ctrl+Shift+S", disabled: !draft }));
}

function shapeTools(workshop) {
  const { draft, gizmo } = workshop;

  const modes = Object.entries(MODES).map(([mode, label], index) => {
    return button(label, () => workshop.setMode(mode), { className: gizmo.mode === mode ? "on" : "", title: `Key ${index + 1}` });
  });

  return [
    el("div", { className: "grow" }, textField("Name", draft.name, { key: "shape name", done: name => workshop.setShape({ name: name || draft.name }) })),
    el("div", { className: "modes" }, ...modes),
    el("div", { className: "buttons" },
      button("Decals", () => workshop.openWindow("decals")),
      button("Materials", () => workshop.openWindow("materials"), { symbol: "palette" }),
      button("Shapes", () => workshop.openWindow("shapes"), { symbol: "shapes", title: "The shapes which are open, to place them" }),
      button("Poses", () => workshop.openWindow("poses"), { symbol: "pose" }),
      button("Animation", () => workshop.openWindow("animation"), { symbol: "reset", title: "Play animations on this shape" }),
      button("Rules", () => workshop.openWindow("rules"), { symbol: "rules" })),
    el("div", { className: "buttons" },
      iconButton("undo", "Undo (Ctrl+Z)", () => workshop.undo(), { disabled: !draft.canUndo }),
      iconButton("redo", "Redo (Ctrl+Y)", () => workshop.redo(), { disabled: !draft.canRedo }))
  ];
}
