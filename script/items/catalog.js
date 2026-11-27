/*
  The Catalog finds the shapes which stand for a LANCER id. Several shapes can have the
  same one, such as a rounded Chomolungma beside the usual one: the first which is found
  is used, and a player can choose another.

  It looks in the items of the world first, then in the compendium of the module, and
  then in the index of the library which comes with it, which is where the compendium
  was made from.

  What has no shape of its own gets a stand-in, one for each kind: a frame becomes a GMS
  Everest, a weapon a plain gun, and a system or a mod a plain box. A weapon stand-in is
  as large as the mount it is made for.
*/

import { filePath, ID, kindOf, typeOf } from "../module.js";

export const EVEREST = "6985fefd-45ec-8960-840f-742b99069994";
export const STAND_INS = { weapon: "b7f3c3a2-0d55-4c61-9a52-4f1e7d3c9a01", system: "c41e0b6d-7a2f-4e88-b1d3-2a9f5c6e8b02" };

const SIZES = { Auxiliary: 0.7, Main: 1, Heavy: 1.3, Superheavy: 1.6, "Ship-class": 2, Integrated: 0.8 };

let index = null;

export async function loadIndex() {
  index ??= fetch(filePath("library/index.json")).then(response => response.json()).catch(() => []);

  return index;
}

export async function entryOf(csgid) {
  const entries = await loadIndex();

  return entries.find(entry => entry.id === csgid) ?? null;
}

export async function choicesFor(lid, kind) {
  const world = game.items.filter(item => kindOf(item) === kind && item.system.mechdata.id === lid).map(item => ({
    name: item.name, csgid: item.system.mechdata.csgid, cid: item.uuid
  }));

  const packed = await packChoices(lid, kind);
  const listed = (await loadIndex()).filter(entry => entry.lids.includes(lid) && kindFor(entry) === kind).map(entry => ({
    name: entry.name, csgid: entry.id, cid: ""
  }));

  const known = new Set();

  return [...world, ...packed, ...listed].filter(choice => {
    if (!choice.csgid || known.has(choice.csgid)) return false;

    known.add(choice.csgid);

    return true;
  });
}

export async function firstFor(lid, kind) {
  const [first] = lid ? await choicesFor(lid, kind) : [];

  if (first) return first;
  if (kind === "mech") return { name: "GMS Everest", csgid: EVEREST, cid: "" };

  return { name: "", csgid: kind === "weapon" ? STAND_INS.weapon : STAND_INS.system, cid: "" };
}

export function sizeFor(gear) {
  return SIZES[gear.size] ?? 1;
}

export function kindFor(entry) {
  return entry.kind === "mech" ? "mech" : entry.type;
}

export function pack() {
  return game.packs.get(`${ID}.library`) ?? null;
}

async function packChoices(lid, kind) {
  const found = pack();

  if (!found) return [];

  const entries = await found.getIndex({ fields: ["system.mechdata.id", "system.mechdata.csgid"] });

  return [...entries].filter(entry => entry.type === typeOf(kind) && entry.system?.mechdata?.id === lid).map(entry => ({
    name: entry.name, csgid: entry.system.mechdata.csgid, cid: entry.uuid
  }));
}
