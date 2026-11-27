/*
  A Finder is where the engine gets the shapes of one mech from (a source, in the words
  of shape-core's library/sources.js). It looks for a shape:
    1. in the customization of the items it is given, those of the mech first
    2. in the customization of the items of the world
    3. in the customization of the compendium items they were made from, which have
       every shape they use
    4. among the stand-ins and in the library of the module, which is what the
       compendium was made from

  The first which has it wins, whatever its revision, so what was changed for a mech is
  what it shows.

  The meshes of its items, and of the compendium items they came from, are made ready
  first, as the engine asks for them without waiting.

  What the library of the module has is read once, for everyone. Its list of ids says
  what is there, so nothing else is asked for.
*/

import { filePath, kindOf } from "../module.js";
import { STAND_INS } from "./catalog.js";
import { keyOf, unpack } from "./meshes.js";

const STAND_IN_FILES = { [STAND_INS.weapon]: "stand-ins/weapon.json", [STAND_INS.system]: "stand-ins/system.json" };
const COMPENDIUM = "Compendium.";
const library = new Map();

let listed = null;

export class Finder {
  #items;
  #packed = [];
  #meshes = new Map();

  constructor(items = []) {
    this.#items = items;
  }

  async prepare() {
    const sources = new Set(this.#items.map(item => item.system.mechdata.cid).filter(cid => cid.startsWith(COMPENDIUM)));

    for (const cid of sources) {
      const found = await fromUuid(cid).catch(() => null);

      if (found) this.#packed.push(found);
    }

    for (const item of [...this.#items, ...this.#packed]) {
      for (const [key, bytes] of await unpack(item.system.mechdata.meshes)) this.#meshes.set(key, bytes);
    }

    return this;
  }

  async read(key) {
    const id = String(key).split("@")[0];

    return this.#customized(id) ?? await readLibrary(id);
  }

  async open(uri) {
    const response = await fetch(uri);

    return new Uint8Array(await response.arrayBuffer());
  }

  mesh(shape) {
    return this.#meshes.get(keyOf(shape.id, shape.stamp)) ?? null;
  }

  #customized(id) {
    const own = this.#items.find(item => item.system.customization?.[id]);
    const world = own ?? game.items.find(item => kindOf(item) && item.system.customization?.[id]);
    const packed = world ?? this.#packed.find(item => item.system.customization?.[id]);
    const json = packed?.system.customization[id];

    return json ? structuredClone(json) : null;
  }
}

export async function readLibrary(id) {
  listed ??= fetch(filePath("library/shapes.json")).then(response => response.json()).then(ids => new Set([...ids, ...Object.keys(STAND_IN_FILES)])).catch(() => null);

  const known = await listed;

  if (known && !known.has(id)) return null;
  if (!library.has(id)) library.set(id, fetchShape(id));

  return library.get(id).then(json => json && structuredClone(json));
}

async function fetchShape(id) {
  const path = STAND_IN_FILES[id] ?? `library/shapes/${encodeURIComponent(id)}.json`;
  const response = await fetch(filePath(path)).catch(() => null);

  return response?.ok ? response.json() : null;
}
