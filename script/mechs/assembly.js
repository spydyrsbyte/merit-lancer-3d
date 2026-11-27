/*
  An Assembly is a mech ready to be drawn: the shape of its loadout, loaded with all it
  uses, from the items of its actor.

  Its items keep the meshes of what they show. Whatever is missing there, or out of date,
  is made by the engine, and written to the item by the one user who looks after the
  actor (see responsible), so it is there the next time. That is how an item which was
  just added gets its meshes: whoever added it may change it.

  What the library of the module has is read once. Finished meshes are also kept in the
  browser, so a mech which was drawn before is quick to draw again.
*/

import { Disk, Library, Shelf } from "../../engine/shape-core/src/index.js";
import { entryOf } from "../items/catalog.js";
import { Finder } from "../items/finder.js";
import { pack, piecesOf, sameMeshes } from "../items/meshes.js";
import { gearOf } from "../lancer/gear.js";
import { ID, kindOf } from "../module.js";
import { Loadout } from "./loadout.js";

const disk = new Disk(ID);

export class Assembly {
  constructor({ actor, shape, library, notes, mounts, mech, gear }) {
    this.actor = actor;
    this.shape = shape;
    this.library = library;
    this.notes = notes;
    this.mounts = mounts;
    this.mech = mech;
    this.gear = gear;
  }

  static async of(actor) {
    const mech = mechItemOf(actor);

    if (!mech?.system.mechdata.csgid) return null;

    const gear = gearItemsOf(actor);
    const finder = await new Finder([mech, ...gear]).prepare();
    const shelf = new Shelf();
    const library = new Library([shelf, finder], disk);
    const loadout = new Loadout(library);
    const wanted = await describe(actor, gear);
    const made = await loadout.shape(actor.uuid, actor.name, mech.system.mechdata, wanted);

    shelf.put(JSON.parse(JSON.stringify(made)));
    library.forget(made.id);

    const shape = await library.load(made.id);
    const assembly = new Assembly({ actor, shape, library, notes: [...loadout.notes, ...library.warnings], mounts: loadout.mounts, mech, gear });

    if (responsible(actor)) await assembly.keepMeshes();

    return assembly;
  }

  async keepMeshes() {
    const updates = [];
    const mine = piecesOf(this.shape);

    if (!sameMeshes(this.mech.system.mechdata.meshes, mine)) updates.push({ _id: this.mech.id, "system.mechdata.meshes": await pack(mine) });

    for (const item of this.gear) {
      const shape = this.library.find(item.system.mechdata.csgid);
      const pieces = shape ? piecesOf(shape) : [];

      if (shape && !sameMeshes(item.system.mechdata.meshes, pieces)) updates.push({ _id: item.id, "system.mechdata.meshes": await pack(pieces) });
    }

    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates, { [ID]: { meshes: true } });
  }
}

export function mechItemOf(actor) {
  return actor?.items.find(item => kindOf(item) === "mech") ?? null;
}

export function gearItemsOf(actor) {
  return actor?.items.filter(item => kindOf(item) && kindOf(item) !== "mech") ?? [];
}

export function responsible(document) {
  const owners = game.users.filter(user => user.active && document.testUserPermission(user, "OWNER"));
  const players = owners.filter(user => !user.isGM);
  const first = [...players.length ? players : owners].sort((a, b) => a.id.localeCompare(b.id))[0];

  return first === game.user;
}

async function describe(actor, items) {
  const lancer = gearOf(actor);
  const described = [];

  for (const item of items) {
    const { id: lid, csgid, at } = item.system.mechdata;
    const index = lancer.findIndex(one => one.lid === lid);
    const known = index >= 0 ? lancer.splice(index, 1)[0] : null;
    const entry = known ? null : await entryOf(csgid);

    described.push({
      item: item.id, lid, csgid, at,
      kind: kindOf(item),
      name: item.name,
      size: known?.size ?? entry?.sizes?.[0] ?? "",
      weapon: known?.weapon ?? entry?.weapon ?? ""
    });
  }

  return described;
}
