/*
  The properties of what is selected, or of the whole shape if nothing is.
*/

import { BUILTINS, isStandard, SIDES, standard } from "../../../shape-core/src/index.js";
import { problemsOf } from "../model/words.js";
import { BUILTIN_NAMES } from "../view/placer.js";
import { movementFields } from "./movement.js";
import { button, checkField, el, field, heading, iconButton, note, numberField, select, selectField, textField, vectorField, wordsField } from "./ui.js";

const PLACES = [["X", "Left and right"], ["Y", "Back and front"], ["Z", "Down and up"]];
const SIZES = [["W", "Width"], ["D", "Depth"], ["H", "Height"]];
const SIDE_LABELS = { center: "Its center", top: "Top", bottom: "Bottom", left: "Left", right: "Right", front: "Front", back: "Back" };

export function inspectorPanel(workshop) {
  const item = workshop.draft.get(workshop.selection.first);

  if (!item) return wholeShape(workshop);

  const others = workshop.selection.ids.length - 1;

  return [
    button(`${workshop.draft.name}: the whole shape`, () => workshop.select(null), { symbol: "shape", className: "whole", title: "Its rules, keywords, author and what to check. Escape does the same." }),
    heading("Properties", others ? el("span", { className: "count", textContent: `and ${others} more` }) : null),
    ...item.kind === "shape" ? shapeFields(workshop, item) : spotFields(workshop, item)
  ];
}

function shapeFields(workshop, item) {
  const { draft } = workshop;
  const { id, value } = item;
  const isBuiltin = BUILTINS.has(value.use);
  const { shape } = draft.thing(id);

  return [
    textField("Name", value.name, { done: name => workshop.set(id, { name }) }),
    selectField("Shape", value.use, shapeChoices(workshop, value.use), use => workshop.useShape(id, use)),
    isBuiltin ? null : el("div", { className: "buttons" },
      button("Edit", () => workshop.desk.enter(id), { symbol: "edit", disabled: shape.builtin, title: "Open this shape. Changes are everywhere it is used. Double-click does the same." }),
      button("Make it its own", () => workshop.makeOwn(id), { disabled: shape.builtin, title: "A copy of this shape, only for here" })),
    ...attachment(workshop, item),
    ...place(workshop, item),
    size(workshop, item, isBuiltin ? "Size" : "Size (times)", isBuiltin ? 1 : 0.05),
    el("div", { className: "pair" },
      checkField("Flipped", value.flip === true, on => workshop.set(id, { flip: on || undefined }), "Swaps its left and right"),
      checkField("Cuts", value.cut === true, on => workshop.set(id, { cut: on || undefined }), "It is taken out of everything else in this shape, instead of being seen")),
    ...paint(workshop, item),
    ...pattern(workshop, item),
    poseChoice(workshop, item, shape),
    wordsField("Keywords", value.keywords, { list: "words-keywords", hint: "melee, blade", title: "What it is, in the words of the rules: for animations, sorting, or whatever uses them", done: keywords => workshop.set(id, { keywords }) })
  ];
}

function spotFields(workshop, item) {
  const { id, kind, value } = item;
  const common = [...attachment(workshop, item), ...place(workshop, item)];

  if (kind === "insignia") {
    return [
      textField("Name", value.name, { done: name => workshop.set(id, { name: name || value.name }) }),
      note("Shift+drag puts it on what is under the pointer."),
      ...common,
      size(workshop, item, "Size", 1),
      numberField("Turn of the picture", value.turn ?? 0, { step: 15, set: turn => workshop.live(id, { turn }), done: () => workshop.done() })
    ];
  }

  if (kind === "plug") {
    return [
      textField("Name", value.name, { done: name => workshop.set(id, { name: name || value.name }) }),
      wordsField("Fits", value.fits, { hint: "hand, mount", title: "What it fits into. Without any, it fits everywhere.", done: fits => workshop.set(id, { fits }) }),
      note("Its arrow points into this shape. It is put on the arrow of a socket."),
      ...common
    ];
  }

  return [
    textField("Name", value.name, { title: "What others are attached to", done: name => workshop.set(id, { name: name || value.name }) }),
    ...movementFields(workshop, item),
    wordsField("Accepts", value.accepts, { hint: "hand, mount", title: "What fits here. Without any, everything does.", done: accepts => workshop.set(id, { accepts }) }),
    checkField("Mirrors what is attached", value.flip === true, on => workshop.set(id, { flip: on || undefined }), "So that one arm fits on both sides"),
    ...common
  ];
}

function shapeChoices(workshop, use) {
  const builtins = [...BUILTINS.keys()].map(key => [key, BUILTIN_NAMES[key]]);
  const others = workshop.usable.map(shape => [shape.id, shape.name, "Open shapes"]);
  const isKnown = [...builtins, ...others].some(([key]) => key === use);

  return isKnown ? [...builtins, ...others] : [...builtins, ...others, [use, "(not there)"]];
}

function attachment(workshop, { id, kind, value }) {
  const { draft } = workshop;
  const blocked = draft.subtree(id);
  const holder = draft.holderOf(id);

  const rows = draft.tree.filter(row => !blocked.has(row.id) && canHold(row, kind));
  const choices = [["", "Nothing"], ...rows.map(row => [row.id, `${" ".repeat(row.depth * 2)}${row.value.name || row.kind}`])];
  const spots = placesOn(draft, holder);

  return [
    selectField("Attached to", holder ?? "", choices, other => workshop.seatOn(id, other || null)),
    spots.length ? selectField("On", fullPlace(draft, value.at), spots, at => workshop.seatAt(id, at)) : null,
    value.at && kind === "shape" ? plugChoice(workshop, id, value) : null
  ];
}

function canHold({ kind, value }, forKind) {
  if (kind === "shape") return true;

  return kind === "socket" && (forKind === "shape" || !value.movement?.name);
}

function placesOn(draft, holder) {
  const item = draft.get(holder);

  if (item?.kind !== "shape") return [];

  const own = draft.rig.skeleton.sockets.filter(open => open.path.split("/")[0] === holder);
  const sides = Object.keys(SIDES).map(side => [`${holder}/${side}`, SIDE_LABELS[side]]);

  return [...sides, ...own.map(open => [`${open.path}/${open.socket.name}`, open.name, "Its sockets"])];
}

function fullPlace(draft, at) {
  const open = draft.rig.skeleton.find(at);

  return open?.socket.name ? `${open.path}/${open.socket.name}` : at;
}

function plugChoice(workshop, id, value) {
  const { plugs } = workshop.draft.thing(id).shape;

  if (!plugs.length) return null;

  const choices = [["", "Whichever fits"], ...plugs.map(({ name }) => [name, name])];

  return selectField("Held by", value.plug ?? "", choices, plug => workshop.set(id, { plug: plug || undefined }));
}

function place(workshop, { id, value }) {
  const { position = [0, 0, 0], rotation = [0, 0, 0] } = value;

  return [
    vectorField("Position", position, PLACES, { set: (axis, number) => workshop.liveAxis(id, "position", axis, number), done: () => workshop.done() }),
    vectorField("Rotation", rotation, PLACES, { step: 5, set: (axis, number) => workshop.liveAxis(id, "rotation", axis, number), done: () => workshop.done() })
  ];
}

function size(workshop, { id, value }, label, step) {
  return vectorField(label, value.size ?? [1, 1, 1], SIZES, {
    step, min: 0.01,
    set: (axis, number) => workshop.liveAxis(id, "size", axis, Math.max(0.01, number)),
    done: () => workshop.done()
  });
}

function paint(workshop, { id, value }) {
  const slots = workshop.paints.slotsOf(id);

  if (!slots.length) return [];
  if (BUILTINS.has(value.use)) return [slotField(workshop, id, value, "primary", "Material")];

  return [heading("Materials"), ...slots.map(slot => slotField(workshop, id, value, slot, workshop.paints.slotName(id, slot)))];
}

function slotField(workshop, id, value, slot, label) {
  const { materials } = workshop.paints;
  const isBuiltin = BUILTINS.has(value.use);
  const chosen = value.paint?.[slot] ?? "";
  const same = isBuiltin || isStandard(slot) ? materials.find(([name]) => name === slot)?.[1].name ?? slot : `Its own`;
  const others = materials.filter(([name]) => name !== slot).map(([name, material]) => [name, material.name]);
  const shown = workshop.paints.slotMaterial(id, slot);

  return el("div", { className: "paint" },
    field(label, select(chosen, [["", same], ...others], name => workshop.paints.paint(id, slot, name), `paint ${slot}`)),
    el("button", { type: "button", className: "swatch-button", title: "Edit this material", on: { click: () => workshop.openMaterials(chosen || slot) } },
      el("img", { src: workshop.swatches.of(shown), alt: "" })));
}

function pattern(workshop, { id, value }) {
  const slots = workshop.paints.slotsOf(id);
  const isPlain = slots.every(slot => workshop.paints.slotMaterial(id, slot).pattern === "solid");

  if (isPlain) return [];

  const { angle = 0, zoom = 1, mirror = false } = value.grain ?? {};
  const change = values => ({ grain: { angle, zoom, mirror, ...workshop.draft.get(id).value.grain, ...values } });

  return [
    el("div", { className: "paint" },
      numberField("Pattern angle", angle, { step: 15, set: number => workshop.live(id, change({ angle: number })), done: () => workshop.done() }),
      numberField("Pattern scale", zoom, { step: 0.1, min: 0.1, set: number => workshop.live(id, change({ zoom: Math.max(0.1, number) })), done: () => workshop.done() })),
    checkField("Pattern mirrored", mirror, on => workshop.set(id, change({ mirror: on })))
  ];
}

function poseChoice(workshop, { id, value }, shape) {
  const poses = Object.entries(shape.poses);

  if (!poses.length) return null;

  const choices = [["", "Its usual pose"], ...poses.map(([slug, { name }]) => [slug, name])];

  return selectField("Pose", value.pose ?? "", choices, pose => workshop.set(id, { pose: pose || undefined }));
}

function wholeShape(workshop) {
  const { draft, session } = workshop;
  const { json } = draft;
  const problems = problemsOf(draft, session.book);
  const { ai, total } = draft.shape.aiParts;

  return [
    heading("This shape"),
    note("Select something to edit it."),
    ...rulesFields(workshop),
    wordsField("Keywords", json.keywords, { list: "words-keywords", hint: "melee, blade", title: "What it is, in the words of the rules: for animations, sorting, or whatever uses them", done: keywords => workshop.setShape({ keywords }) }),
    heading("Made by"),
    ...authorFields(workshop),
    total > 1 ? note(`AI made ${ai} of the ${total} shapes in it.`) : null,
    problems.length ? heading("Check", el("span", { className: "count", textContent: String(problems.length) })) : null,
    ...problems.map(text => note(text, "problem"))
  ];
}

function rulesFields(workshop) {
  const { draft, session } = workshop;
  const { format } = draft.json;
  const { book } = session;
  const chosen = book.rulesFor(format);
  const value = chosen && !book.isOther(format) ? chosen.id : format ? "missing" : "";
  const loaded = book.all.map(rules => [rules.id, rules.name]);
  const missing = format && value === "missing" ? [["missing", `${format.name} (not loaded)`]] : [];
  const choices = [["", "None"], ...loaded, ...missing];

  return [
    el("div", { className: "paint" },
      selectField("Follows the rules", value, choices, id => workshop.follow(id)),
      iconButton("rules", "Load rules", () => workshop.openWindow("rules")))
  ];
}

function authorFields(workshop) {
  const { author } = workshop.draft.json;
  const change = values => workshop.setShape({ author: { ...author, ...values } });

  return [
    checkField("AI made it", author.ai === 1, on => change({ ai: on ? 1 : 0 }), "Whether AI made this shape. Only a person may take it away, for what they have redone as their own."),
    textField("Author", author.name, { done: name => change({ name }) }),
    textField("Email", author.email, { done: email => change({ email }) }),
    textField("License", author.licenseUri, { hint: "https://", done: licenseUri => change({ licenseUri }) }),
    textField("Social", (author.social ?? []).join(", "), {
      hint: "discord:name", done: text => change({ social: text.split(",").map(one => one.trim()).filter(Boolean) })
    })
  ];
}
