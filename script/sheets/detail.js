/*
  The Detail of an item: quick changes for whoever plays it, as in the Mech Designer.
  It never shows shapes, joints or numbers.

    Shape     which of the shapes for its LANCER id it shows
    Colors    the five standard colors, for the whole mech
    Pose      the pose it stands in, of those its shape has
    Mount     for gear: where on the mech it goes, or wherever the mech chooses

  Update makes its meshes anew, which picks up newer shapes of the world and the
  library. Back to the original forgets what was changed. A token picture of a mech can
  be opened, to take its look. How its own token picture looks is in the Token tab.

  A change of colors or pose needs no new meshes, as those are kept by material and
  bend at their joints.
*/

import { Library, portrait, STANDARD_NAMES, standard } from "../../engine/shape-core/src/index.js";
import { choicesFor } from "../items/catalog.js";
import { customize, itemsAround, paintOf, shapeJsonOf } from "../items/customize.js";
import { Finder } from "../items/finder.js";
import { gearOf } from "../lancer/gear.js";
import { freeSockets } from "../mechs/loadout.js";
import { gearItemsOf, mechItemOf } from "../mechs/assembly.js";
import { ID, kindOf, say } from "../module.js";
import { readPicture } from "../tokens/token-file.js";
import { tokenMechs } from "../canvas/token-mechs.js";
import { action, choice, el, row } from "./dom.js";
import { replaceShapes } from "./workshop-host.js";

const PREVIEW = 360;

export async function detailOf(item) {
  const kind = kindOf(item);
  const actor = item.parent instanceof Actor ? item.parent : null;
  const assembly = actor && mechItemOf(actor) ? await tokenMechs.assemblyOf(actor).catch(() => null) : null;
  const shape = await shownShape(item, assembly);
  const json = await shapeJsonOf(item);
  const canEdit = item.isOwner && !item.pack;

  const parts = [
    el("div", { className: "merit3d-preview" }, await previewOf(kind === "mech" && assembly ? assembly.shape : shape)),
    el("fieldset", { disabled: !canEdit },
      row(say("Detail.Shape"), await shapeChoice(item, kind)),
      json ? colorRows(item, json) : null,
      json && Object.keys(json.poses ?? {}).length ? poseRow(item, json) : null,
      kind !== "mech" && assembly ? mountRow(item, assembly) : null),
    notesOf(assembly),
    el("div", { className: "merit3d-buttons" },
      action(say("Detail.Update"), "fa-rotate", () => rebuild(item), { disabled: !canEdit, title: say("Detail.UpdateHint") }),
      action(say("Detail.Original"), "fa-arrow-rotate-left", () => original(item), { disabled: !canEdit }),
      kind === "mech" && actor ? action(say("Detail.OpenPicture"), "fa-file-import", () => openPicture(item), { disabled: !canEdit }) : null)
  ];

  return el("div", { className: "merit3d-detail" }, ...parts);
}

async function shownShape(item, assembly) {
  const { csgid } = item.system.mechdata;
  const found = assembly?.library.find(csgid);

  if (found) return found;
  if (!csgid) return null;

  const finder = await new Finder(itemsAround(item)).prepare();

  return new Library([finder]).load(csgid).catch(() => null);
}

async function previewOf(shape) {
  if (!shape) return el("p", { className: "hint", textContent: say("Detail.NoShape") });

  const bytes = await portrait(shape, PREVIEW).catch(() => null);

  if (!bytes) return el("p", { className: "hint", textContent: say("Detail.NoShape") });

  const address = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));

  return el("img", { src: address, alt: shape.name, onload: () => URL.revokeObjectURL(address) });
}

async function shapeChoice(item, kind) {
  const { id: lid, csgid } = item.system.mechdata;
  const choices = await choicesFor(lid, kind);
  const known = choices.some(one => one.csgid === csgid);
  const options = [...choices, ...known ? [] : [{ name: say("Detail.Own"), csgid, cid: "" }]];

  return choice(csgid, options.map(one => ({ value: one.csgid, label: one.name })), value => {
    const chosen = options.find(one => one.csgid === value);

    item.update({ "system.mechdata.csgid": value, "system.mechdata.cid": chosen?.cid ?? "", "system.mechdata.meshes": [] });
  });
}

function colorRows(item, json) {
  return STANDARD_NAMES.map(name => {
    const material = standard(name, json.materials?.[name] ?? {});
    const input = el("input", {
      type: "color",
      value: material.colors[0],
      onchange: () => customize(item, shape => paintOf(shape, name, input.value))
    });

    return row(say(`Detail.Color.${name}`), input);
  });
}

function poseRow(item, json) {
  const options = [{ value: "", label: say("Detail.AsBuilt") }, ...Object.entries(json.poses).map(([slug, pose]) => ({ value: slug, label: pose.name ?? slug }))];

  return row(say("Detail.Pose"), choice(json.pose ?? "", options, value => customize(item, shape => {
    shape.pose = value;
  })));
}

function mountRow(item, assembly) {
  const frame = assembly.library.find(assembly.mech.system.mechdata.csgid);
  const gear = { kind: kindOf(item), ...gearOf(assembly.actor).find(one => one.lid === item.system.mechdata.id) };
  const sockets = frame ? freeSockets(frame, gear) : [];
  const now = assembly.mounts.find(mount => mount.item === item.id)?.at ?? "";
  const options = [{ value: "", label: say("Detail.MechChooses") }, ...sockets.map(open => ({ value: open.name, label: plainName(open.name) }))];
  const chosen = item.system.mechdata.at;

  return [
    row(say("Detail.Mount"), choice(chosen, options, value => item.update({ "system.mechdata.at": value }))),
    chosen ? null : el("p", { className: "hint", textContent: now ? say("Detail.MountNow", { at: plainName(now) }) : say("Detail.NoMount") })
  ];
}

function plainName(name) {
  const words = name.replace(/^mount-/, "").split("-");

  return words.join(" ").replace(/^./, letter => letter.toUpperCase());
}

function notesOf(assembly) {
  if (!assembly?.notes.length) return null;

  return el("ul", { className: "merit3d-notes" }, ...assembly.notes.map(text => el("li", { textContent: text })));
}

export async function rebuild(item) {
  await item.update({ "system.mechdata.meshes": [] }, { [ID]: { edited: true } });
  ui.notifications.info(say("Detail.Updated", { name: item.name }));
}

async function original(item) {
  const removed = Object.fromEntries(Object.keys(item.system.customization ?? {}).map(id => [`system.customization.-=${id}`, null]));

  await item.update({ ...removed, "system.mechdata.at": "", "system.mechdata.meshes": [] }, { [ID]: { edited: true } });
}

export async function openPicture(item) {
  const file = await pickPicture();
  const opened = file && await readPicture(new Uint8Array(await file.arrayBuffer()));

  if (!opened) return file && ui.notifications.warn(say("Detail.NotAPicture"));

  const { shapes, top, lancer } = opened;
  const actor = item.parent;
  const kept = Object.fromEntries(shapes.filter(json => json.id !== top.id || !lancer).map(json => [json.id, json]));
  const csgid = lancer?.mech?.csgid ?? top.id;

  await replaceShapes(item, kept, { more: { "system.mechdata.csgid": csgid } });

  const updates = [];
  const free = [...gearItemsOf(actor)];

  for (const gear of lancer?.gear ?? []) {
    const index = free.findIndex(one => one.system.mechdata.id === gear.id && kindOf(one) === gear.kind);

    if (index < 0) continue;

    const [one] = free.splice(index, 1);

    updates.push({ _id: one.id, "system.mechdata.csgid": gear.csgid, "system.mechdata.at": gear.at ?? "", "system.mechdata.meshes": [] });
  }

  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

  ui.notifications.info(say("Detail.Opened", { name: top.name }));
}

function pickPicture() {
  return new Promise(resolve => {
    const input = el("input", { type: "file", accept: ".png", onchange: () => resolve(input.files[0] ?? null), oncancel: () => resolve(null) });

    input.click();
  });
}
