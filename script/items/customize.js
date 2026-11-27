/*
  Changing what an item shows: its shape is taken from wherever it is found, changed,
  and kept in the customization of the item. The first change gives it the next
  revision, so it is newer than where it came from.

  Colors and poses need no new meshes, as meshes keep their materials by name and bend
  at their joints. Anything else does.
*/

import { gearItemsOf, mechItemOf } from "../mechs/assembly.js";
import { replaceShapes } from "../sheets/workshop-host.js";
import { Finder } from "./finder.js";

export function itemsAround(item) {
  const actor = item.parent instanceof Actor ? item.parent : null;
  const around = actor ? [mechItemOf(actor), ...gearItemsOf(actor)] : [];

  return [...new Set([item, ...around].filter(Boolean))];
}

export async function shapeJsonOf(item) {
  const { csgid } = item.system.mechdata;

  return csgid ? new Finder(itemsAround(item)).read(csgid) : null;
}

export async function customize(item, change, { rebuild = false } = {}) {
  const json = await shapeJsonOf(item);

  if (!json) return false;

  const isNew = !item.system.customization?.[json.id];

  change(json);

  if (isNew) json.revision = (json.revision ?? 1) + 1;

  await replaceShapes(item, { [json.id]: json }, { rebuild });

  return true;
}

export function paintOf(json, name, color) {
  const own = json.materials?.[name] ?? {};
  const colors = [color, ...(own.colors ?? []).slice(1)];

  json.materials = { ...json.materials, [name]: { ...own, colors } };
}
