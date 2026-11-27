/*
  A Design is a mech while the Mech Designer changes it: which frame it is built on,
  the colors and pose of that frame, its insignia, and its gear, each with the mount it
  is on and how it sits there. Nothing is written until it is saved, and every change
  can be undone, as in the Designer of merit-mech-workshop.

  The frame is the shape of the mech item, as JSON, with what this mech changed in it.
  The base is the same shape as it comes, from the world or the library, which is what
  "back to the color of the frame" goes back to.

  Gear is what the mech item's actor has: an item for each LANCER weapon, system and mod,
  and those which were put on by hand. Each is { key, item, lid, kind, name, csgid, at,
  place, byHand }, where key is the item's id, or "new:<number>" for one which is put on
  now. Gear of LANCER which is taken off stays, with place.off; gear put on by hand is
  taken away.

  Putting gear on a mount which holds something else trades places: what was there goes
  where the gear came from, if it fits there, and is taken off if not.

  Its preview is the mech as it is now, built like a token builds it (see
  mechs/loadout.js), with the frame as it is here.

  Saving writes the frame into the customization of the mech item, if it differs from
  the base, and each gear item as it is here.
*/

import { Figure, Library, Shelf } from "../../engine/shape-core/src/index.js";
import { entryOf } from "../items/catalog.js";
import { Finder } from "../items/finder.js";
import { gearOf } from "../lancer/gear.js";
import { gearItemsOf, mechItemOf } from "../mechs/assembly.js";
import { Loadout } from "../mechs/loadout.js";
import { ID, kindOf, typeOf } from "../module.js";
import { replaceShapes } from "../sheets/workshop-host.js";

const NEW = "new:";
const PREVIEW_REVISION = 1e9;

export class Design {
  #actor;
  #count = 0;
  #library = null;

  constructor(actor, values) {
    this.#actor = actor;

    Object.assign(this, values);
  }

  static async read(actor) {
    const mech = mechItemOf(actor);
    const items = [mech, ...gearItemsOf(actor)];
    const { csgid, cid, insignia } = mech.system.mechdata;
    const frame = await new Finder(items).read(csgid);
    const base = await new Finder([]).read(csgid);

    const gear = gearItemsOf(actor).map(item => ({
      key: item.id,
      item: item.id,
      lid: item.system.mechdata.id,
      kind: kindOf(item),
      name: item.name,
      csgid: item.system.mechdata.csgid,
      at: item.system.mechdata.at,
      place: structuredClone(item.system.mechdata.place ?? {}),
      byHand: Boolean(item.getFlag(ID, "byHand"))
    }));

    return new Design(actor, { csgid, cid, frame, base: base ?? structuredClone(frame), insignia: structuredClone(insignia ?? {}), gear });
  }

  get actor() {
    return this.#actor;
  }

  get state() {
    const { csgid, cid, frame, base, insignia, gear } = this;

    return JSON.stringify({ csgid, cid, frame, base, insignia, gear });
  }

  set state(text) {
    Object.assign(this, JSON.parse(text));
  }

  get shown() {
    return this.gear.filter(one => !one.removed && !one.place?.off);
  }

  find(key) {
    return this.gear.find(one => one.key === key && !one.removed) ?? null;
  }

  addPart(entry, at = "") {
    const key = `${NEW}${++this.#count}`;

    this.gear.push({ key, item: key, lid: entry.lids?.[0] ?? "", kind: entry.kind, name: entry.name, csgid: entry.csgid, at, place: {}, byHand: true });

    return key;
  }

  takeOff(key) {
    const one = this.find(key);

    if (!one) return;

    if (one.byHand) one.removed = true;
    else one.place = { ...one.place, off: true };
  }

  putOn(key, at, { holder = null, from = "", fits = () => false } = {}) {
    const one = this.find(key);

    if (!one) return;

    if (holder && holder !== key) {
      const other = this.find(holder);

      if (from && fits(holder, from)) other.at = from;
      else this.takeOff(holder);
    }

    one.at = at;
    one.place = { ...one.place, off: false };
  }

  async preview() {
    this.#library ??= await this.#makeLibrary();

    const { library, shelf } = this.#library;

    library.forget(this.frame.id);
    shelf.put({ ...structuredClone(this.frame), revision: PREVIEW_REVISION + ++this.#count });

    const loadout = new Loadout(library);
    const wanted = await this.#describe();
    const made = await loadout.shape(this.#actor.uuid, this.#actor.name, { csgid: this.csgid, insignia: this.insignia }, wanted);

    shelf.put(JSON.parse(JSON.stringify(made)));
    library.forget(made.id);

    const shape = await library.load(made.id);

    return { shape, library, figure: new Figure(shape), mounts: loadout.mounts, notes: [...loadout.notes, ...library.warnings], frame: library.find(this.csgid) };
  }

  async save() {
    const mech = mechItemOf(this.#actor);
    const before = mech.system.mechdata;
    const isOtherFrame = before.csgid !== this.csgid;
    const changed = JSON.stringify(this.frame) !== JSON.stringify(this.base);
    const more = { "system.mechdata.csgid": this.csgid, "system.mechdata.cid": this.cid, "system.mechdata.insignia": this.insignia };

    if (changed) await replaceShapes(mech, { [this.csgid]: this.frame }, { rebuild: isOtherFrame, more });
    else await mech.update({ [`system.customization.-=${this.csgid}`]: null, ...more, ...isOtherFrame ? { "system.mechdata.meshes": [] } : {} });

    const items = new Map(gearItemsOf(this.#actor).map(item => [item.id, item]));
    const updates = [];
    const removed = [];
    const created = [];

    for (const one of this.gear) {
      const item = items.get(one.item);
      const mechdata = { csgid: one.csgid, at: one.at, place: one.place };

      if (one.removed) {
        if (item) removed.push(item.id);
      } else if (item) {
        const meshes = item.system.mechdata.csgid === one.csgid ? {} : { "system.mechdata.meshes": [] };

        updates.push({ _id: item.id, "system.mechdata.csgid": one.csgid, "system.mechdata.at": one.at, "system.mechdata.place": one.place, ...meshes });
      } else {
        created.push({ name: one.name, type: typeOf(one.kind), system: { mechdata: { id: one.lid, ...mechdata }, customization: {} }, flags: { [ID]: { byHand: true } } });
      }
    }

    if (removed.length) await this.#actor.deleteEmbeddedDocuments("Item", removed);
    if (updates.length) await this.#actor.updateEmbeddedDocuments("Item", updates);
    if (created.length) await this.#actor.createEmbeddedDocuments("Item", created);
  }

  async #makeLibrary() {
    const items = [mechItemOf(this.#actor), ...gearItemsOf(this.#actor)];
    const finder = await new Finder(items).prepare();
    const shelf = new Shelf();

    return { shelf, library: new Library([shelf, finder]) };
  }

  async #describe() {
    const lancer = gearOf(this.#actor);
    const described = [];

    for (const one of this.gear.filter(gear => !gear.removed)) {
      const index = lancer.findIndex(known => known.lid === one.lid);
      const known = index >= 0 && !one.byHand ? lancer.splice(index, 1)[0] : null;
      const entry = known ? null : await entryOf(one.csgid);

      described.push({
        item: one.key, lid: one.lid, csgid: one.csgid, at: one.at, place: one.place, kind: one.kind, name: one.name,
        size: known?.size ?? entry?.sizes?.[0] ?? "",
        weapon: known?.weapon ?? entry?.weapon ?? ""
      });
    }

    return described;
  }
}
