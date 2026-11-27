/*
  Keeps the items of the module on an actor in step with what it has in LANCER, so it
  is mostly automatic: a mech item for its frame, and a gear item for each weapon,
  system and mod, by their LANCER ids.

  A missing one is made from the first shape which stands for it (see catalog.js). One
  whose LANCER item is gone is removed. A mech item which stands for another frame than
  the actor has now starts over, as its changes were for the other frame.

  Only the one user who looks after the actor does this, so it happens once.
*/

import { frameOf, gearOf, MECH_ACTORS } from "../lancer/gear.js";
import { gearItemsOf, mechItemOf, responsible } from "../mechs/assembly.js";
import { ID, typeOf } from "../module.js";
import { firstFor } from "./catalog.js";

const busy = new WeakSet();

export async function ensureItems(actor) {
  if (!actor || !MECH_ACTORS.has(actor.type) || busy.has(actor) || !responsible(actor)) return false;

  busy.add(actor);

  try {
    return await bringInStep(actor);
  } finally {
    busy.delete(actor);
  }
}

async function bringInStep(actor) {
  const frame = frameOf(actor);
  const lid = frame?.system?.lid ?? "";
  const mech = mechItemOf(actor);
  const wanted = gearOf(actor);
  const extra = [...gearItemsOf(actor)];
  const missing = [];

  for (const gear of wanted) {
    const index = extra.findIndex(item => item.system.mechdata.id === gear.lid && item.type === typeOf(gear.kind));

    if (index >= 0) extra.splice(index, 1);
    else missing.push(gear);
  }

  const created = await Promise.all(missing.map(gear => itemFor(gear.lid, gear.kind, gear.name)));
  const isOtherFrame = mech && mech.system.mechdata.id !== lid;

  if (!mech || isOtherFrame) created.unshift(await itemFor(lid, "mech", frame?.name ?? actor.name));

  const removed = [...extra.map(item => item.id), ...isOtherFrame ? [mech.id] : []];

  if (removed.length) await actor.deleteEmbeddedDocuments("Item", removed, { [ID]: { automatic: true } });
  if (created.length) await actor.createEmbeddedDocuments("Item", created, { [ID]: { automatic: true } });

  return removed.length > 0 || created.length > 0;
}

async function itemFor(lid, kind, name) {
  const { name: found, csgid, cid } = await firstFor(lid, kind);

  return {
    name: name || found || kind,
    type: typeOf(kind),
    system: { mechdata: { id: lid, cid, csgid }, customization: {} }
  };
}
