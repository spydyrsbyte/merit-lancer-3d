/*
  The left side of the Animation window: the animations which are open, by what they
  play, and the shape's own.

  The shape's own animations are its "animations" list: for a slot of the rules, such
  as walk, the animation it uses instead of one the rules would choose, and slots of its
  own, which only this shape has. They are saved with the shape (see model/files.js).

  What the editor gives it:
    animations (drafts), chosen (an id), slots (names), own ({ slot: id })
    show(id), create(plays, isOwn), copy(), save(asNew), undo(), redo(), openFiles()
    setOwn(slot, id), addSlot(name)
*/

import { button, el, heading, iconButton, select, textField } from "./ui.js";

export function animationList(editor) {
  const groups = Map.groupBy(editor.animations, draft => draft.json.plays ?? "");
  const owned = new Set(Object.values(editor.own));
  const draft = editor.animations.find(one => one.id === editor.chosen);

  const rows = [...groups].sort(([a], [b]) => a.localeCompare(b)).flatMap(([plays, drafts]) => [
    el("li", { className: "group", textContent: plays || "(plays nothing)" }),
    ...drafts.map(one => el("li", { className: one.id === editor.chosen ? "current" : "", title: one.id, on: { click: () => editor.show(one.id) } },
      el("span", { className: "name", textContent: one.name }),
      owned.has(one.id) ? el("span", { className: "own", textContent: "own", title: "One of the shape's own" }) : null,
      one.isSaved ? null : el("span", { className: "dirty", textContent: "●", title: "Unsaved changes" })))
  ]);

  return [
    heading("Animations"),
    el("ol", { className: "entries", data: { scroll: "animations" } }, ...rows,
      rows.length ? null : el("li", { className: "empty", textContent: "Make a new animation, or open one." })),
    el("div", { className: "buttons" },
      button("New", () => editor.create(""), { symbol: "file" }),
      button("Open", () => editor.openFiles(), { symbol: "open" }),
      button("Copy", () => editor.copy(), { symbol: "copy", disabled: !draft, title: "A copy of it, as a new animation" })),
    el("div", { className: "buttons" },
      button("Save", () => editor.save(false), { symbol: "save", disabled: !draft, className: draft && !draft.isSaved ? "main" : "" }),
      button("Save as", () => editor.save(true), { disabled: !draft }),
      iconButton("undo", "Undo (Ctrl+Z)", () => editor.undo(), { disabled: !draft?.canUndo }),
      iconButton("redo", "Redo (Ctrl+Y)", () => editor.redo(), { disabled: !draft?.canRedo })),
    heading("The shape's own"),
    ...ownRows(editor)
  ];
}

function ownRows(editor) {
  const slots = [...new Set([...editor.slots, ...Object.keys(editor.own)])];

  const rows = slots.map(slot => {
    const chosen = editor.own[slot] ?? "";
    const fitting = editor.animations.filter(one => one.json.plays === slot || one.id === chosen);
    const choices = [["", "What the rules choose"], ...fitting.map(one => [one.id, one.name])];
    const isOwnSlot = !editor.slots.includes(slot);

    return el("div", { className: "own-row" },
      el("span", { className: "slot", textContent: slot, title: isOwnSlot ? "A slot of this shape only" : "A slot of the rules" }),
      select(chosen, choices, id => editor.setOwn(slot, id), `own ${slot}`),
      iconButton("plus", `A new animation for ${slot}, as the shape's own`, () => editor.create(slot, true)));
  });

  return [
    ...rows,
    textField("Slot of its own", "", { key: "own slot", hint: "such as transform", done: name => name && editor.addSlot(name) })
  ];
}
