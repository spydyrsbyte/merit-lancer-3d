/*
  The Foundry host of the Shape Workshop (see model/files.js of shape-workshop for what
  a host offers). Its files are the shapes of one item:

    item/<item uuid>/<shape id>.json

  Writing one puts the shape in the customization of the item, so the item shows it
  from then on. Animations are written the same way, by their id, beside its shapes. Reading one finds it where the item would: in its customization and
  those of the other items of its actor, then in the world, then in the library.

  A save writes everything in a shape, also what was not changed. Only what was changed
  goes into the customization, so the rest keeps following the library: a shape is
  taken when its revision is not that of the library, or when the item has it already.

  The writes of one save are put together, and the meshes of the item are made anew
  after them: that is when an editor has finished editing.

  Files from the computer come in through a file input, and a PNG which is written is
  given to the computer to save.
*/

import { Finder, readLibrary } from "../items/finder.js";
import { gearItemsOf, mechItemOf } from "../mechs/assembly.js";
import { RULES_FILES } from "../mechs/motion.js";
import { filePath, ID, say } from "../module.js";

const PREFIX = "item/";
const GATHER = 150;

export class WorkshopHost {
  #item;
  #motion;
  #waiting = new Map();
  #timer = null;
  #finished = null;
  #written = null;

  constructor(item, motion, changed) {
    this.#item = item;
    this.#motion = motion;
    this.changed = changed;
  }

  get folder() {
    return `${PREFIX}${this.#item.uuid}/`;
  }

  pathOf(id) {
    return `${this.folder}${id}.json`;
  }

  async fileOf(id) {
    const json = await this.#finder().then(finder => finder.read(id));

    if (!json) return null;

    return { path: this.pathOf(id), name: json.name, bytes: encode(json) };
  }

  pickShapes = () => pickFiles(".json,.png", true);

  pickRules = () => pickFiles(".json", true);

  pickTarget = async name => this.pathOf(name);

  beside = (path, key) => `${folderOf(path)}${key}.json`;

  readBeside = async (path, key) => {
    const json = await this.#finder().then(finder => finder.read(key));

    return json ? encode(json) : null;
  };

  write = async (path, bytes) => {
    if (/\.png$/i.test(path)) return saveToComputer(path, bytes);

    const json = JSON.parse(new TextDecoder().decode(bytes));

    if (!await this.#isChanged(json)) return;

    this.#waiting.set(json.id, json);
    this.#gather();
  };

  ask = async ({ message, detail, buttons }) => {
    const choices = buttons.map((label, index) => ({ action: String(index), label, default: index === 0 }));
    const content = `<p>${foundry.utils.escapeHTML(message)}</p><p>${foundry.utils.escapeHTML(detail ?? "")}</p>`;
    const answer = await foundry.applications.api.DialogV2.wait({ window: { title: say("Workshop.Title") }, content, buttons: choices, rejectClose: false });

    return answer === null || answer === undefined ? buttons.length - 1 : Number(answer);
  };

  findRules = async format => {
    for (const path of RULES_FILES) {
      const response = await fetch(filePath(path));
      const json = await response.json();

      if (json.id === format?.id || json.name === format?.name || json.id === format || json.name === format) {
        return { path, name: json.name, bytes: encode(json) };
      }
    }

    return null;
  };

  animations = async () => this.#motion.files;

  async rules() {
    return Promise.all(RULES_FILES.map(async path => ({ path, name: path, bytes: new Uint8Array(await (await fetch(filePath(path))).arrayBuffer()) })));
  }

  get saving() {
    return this.#finished ?? Promise.resolve();
  }

  async #finder() {
    const actor = this.#item.parent;
    const items = actor ? [this.#item, mechItemOf(actor), ...gearItemsOf(actor)].filter(Boolean) : [this.#item];

    return new Finder([...new Set(items)]);
  }

  async #isChanged(json) {
    if (this.#item.system.customization?.[json.id]) return true;

    const kept = await readLibrary(json.id);

    return !kept || (kept.revision ?? 1) !== (json.revision ?? 1);
  }

  #gather() {
    clearTimeout(this.#timer);

    this.#finished ??= new Promise(resolve => {
      this.#written = resolve;
    });

    this.#timer = setTimeout(() => this.#flush(), GATHER);
  }

  async #flush() {
    const shapes = Object.fromEntries(this.#waiting);
    const written = this.#written;

    this.#waiting.clear();
    this.#finished = null;
    this.#written = null;

    await replaceShapes(this.#item, shapes).catch(error => ui.notifications.error(error.message));

    written?.();
  }
}

export async function replaceShapes(item, shapes, { more = {}, rebuild = true } = {}) {
  const kept = Object.keys(shapes).filter(id => item.system.customization?.[id]);
  const meshes = rebuild ? { "system.mechdata.meshes": [] } : {};

  if (kept.length) await item.update(Object.fromEntries(kept.map(id => [`system.customization.-=${id}`, null])), { [ID]: { meshes: true } });

  await item.update({ "system.customization": shapes, ...meshes, ...more }, { [ID]: { edited: true } });
}

function encode(json) {
  return new TextEncoder().encode(JSON.stringify(json));
}

function folderOf(path) {
  return path.replace(/[^/]+$/, "");
}

function pickFiles(accept, multiple) {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept, multiple });

    input.addEventListener("change", async () => {
      const files = await Promise.all([...input.files].map(async file => ({ path: null, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));

      resolve(files);
    });

    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

function saveToComputer(path, bytes) {
  const name = path.split("/").at(-1);
  const address = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  const link = Object.assign(document.createElement("a"), { href: address, download: name });

  link.click();
  setTimeout(() => URL.revokeObjectURL(address), 1000);
}
