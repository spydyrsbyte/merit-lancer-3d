/*
  The Files of a session: which shape came from which file, and how it is written.

  As a PNG, a shape is written with everything it uses in one file. As JSON, a file is
  one shape, so those it uses are written next to it, as "id.json", unless they are
  there already.

  A shape without a file of its own is held by the file of what it is in: first what it
  was entered from, and then any open shape with a file which has it inside.

  Whatever is in a file is written as files are written now, also what was not changed:
  a shape which only names its rules gets their id, if they are loaded. A shape which was
  not changed keeps its revision, and a file with a newer one is never written over. A shape with a file of its own which was changed is asked about, as
  others may use it too.

  An animation is a file of its own. A shape's own animations (its "animations" list) go
  along with it: they are written next to its JSON, by their ids, when they were changed
  or have no file yet, and inside of its PNG. When a shape is opened, its own animations
  are read from next to it. A file which plays something is an animation, not a shape.

  The host is the program around the workshop. It is who asks, reads and writes:
    pickShapes()           files to open, as { path, name, bytes }
    pickRules()            the same for rules
    pickTarget(name)       where to write, as a path, or nothing
    readBeside(path, key)  the bytes of "key.json" in the folder of a file, or nothing
    write(path, bytes)
    beside(path, key)      the path of "key.json" in the folder of a file
    ask(question)          which button was pressed, of { message, detail, buttons }

  And if it wants to:
    changed(isUnsaved, name)   told after every change
    rulesChanged(paths)        the rules files which are loaded
    findRules(format)          the file of rules, by their id or name, if it knows one
*/

import { Picture, portrait } from "../../../shape-core/src/index.js";
import { fileName } from "./names.js";

const PNG = /\.png$/i;

export class Files {
  #session;
  #host;
  #paths = new Map();

  constructor(session, host) {
    this.#session = session;
    this.#host = host;
  }

  pathOf(draft) {
    return this.#paths.get(draft.id) ?? null;
  }

  holderOf(draft) {
    if (this.pathOf(draft)) return null;

    const isInside = one => one !== draft && this.pathOf(one) && [...one.shape.everything].some(shape => shape.id === draft.id);

    for (let one = draft.cameFrom; one; one = one.cameFrom) {
      if (isInside(one)) return one;
    }

    return this.#session.tabs.find(isInside) ?? null;
  }

  async open({ path, name, bytes }) {
    const draft = await this.#session.open(bytes, path ? this.#origin(path) : null).catch(error => {
      throw new Error(`${name}: ${error.message}`);
    });

    if (path && !this.#paths.has(draft.id)) this.#paths.set(draft.id, path);
    if (path && !PNG.test(path)) await this.#readOwnAnimations(draft, path);

    return draft;
  }

  openAnimation({ path, name, bytes }) {
    try {
      const draft = this.#session.openAnimation(bytes);

      if (path && !this.#paths.has(draft.id)) this.#paths.set(draft.id, path);

      return draft;
    } catch (error) {
      throw new Error(`${name}: ${error.message}`);
    }
  }

  async saveAnimation(draft, asNew = false) {
    const known = asNew ? null : this.pathOf(draft);
    const path = known ?? await this.#host.pickTarget(fileName(draft.name), this.pathOf(draft));

    if (!path) return null;

    await this.#writeAnimation(draft, path);

    return path;
  }

  async save(draft, asNew = false) {
    const known = asNew ? null : this.pathOf(draft);
    const path = known ?? await this.#host.pickTarget(fileName(draft.name), this.pathOf(draft));

    if (!path) return null;

    draft.end();

    const isPicture = PNG.test(path);
    const others = isPicture ? [] : await this.#others(draft, path);

    if (!others) return null;

    const note = isPicture ? await this.#writePicture(draft, path) : await this.#writeText(draft, path);

    for (const other of others) await this.#writeText(other.draft, other.path, true);

    const moves = isPicture ? [] : await this.#writeOwnAnimations(draft, path);

    return [note, written(others), movesWritten(moves)].filter(Boolean).join(" ");
  }

  async #writePicture(draft, path) {
    this.#renew(draft);

    const inside = this.#session.inside(draft).filter(one => !this.#paths.has(one.id));

    for (const one of inside) this.#renew(one, true);

    draft.refresh();

    const own = this.#session.ownAnimations(draft);

    for (const one of own) this.#renewAnimation(one);

    const picture = Picture.of(draft.shape, json => this.#current(json), own.map(one => structuredClone(one.json)));
    const bytes = await picture.into(await portrait(draft.shape));

    await this.#host.write(path, bytes);
    this.#kept(draft, path);

    for (const one of inside) one.markSaved();
    for (const one of own) one.markSaved();

    if (picture.hidden) return "";

    return "It has too much in it to be hidden in the dots, so a website which changes pictures would lose the shape.";
  }

  async #writeText(draft, path, isInside = false) {
    this.#renew(draft, isInside);

    const json = this.#current(draft.file);

    if (draft.hasRecipe) json.data = { uri: "" };

    await this.#host.write(path, new TextEncoder().encode(JSON.stringify(json, null, 2)));
    this.#kept(draft, path);
  }

  async #writeAnimation(draft, path) {
    draft.end();
    this.#renewAnimation(draft, Boolean(this.pathOf(draft)));

    await this.#host.write(path, new TextEncoder().encode(JSON.stringify(draft.json, null, 2)));
    this.#kept(draft, path);
  }

  async #writeOwnAnimations(draft, path) {
    const written = [];

    for (const one of this.#session.ownAnimations(draft)) {
      const own = this.#paths.get(one.id);
      const isNear = Boolean(own) && !PNG.test(own) && folderOf(own) === folderOf(path);

      if (isNear && one.isSaved) continue;

      await this.#writeAnimation(one, isNear ? own : this.#host.beside(path, one.id));
      written.push(one);
    }

    return written;
  }

  async #readOwnAnimations(draft, path) {
    for (const id of Object.values(draft.json.animations ?? {})) {
      if (!id || this.#session.animations.has(id)) continue;

      const bytes = await this.#host.readBeside(path, id);

      if (!bytes) continue;

      try {
        this.#session.openAnimation(bytes);
        this.#paths.set(id, this.#host.beside(path, id));
      } catch {
        continue;
      }
    }
  }

  #renewAnimation(draft, isFiled = true) {
    if (draft.isSaved || !isFiled) return;

    draft.json.revision = (draft.json.revision ?? 1) + 1;
    draft.refresh();
  }

  async #others(draft, path) {
    const wanted = await this.#beside(draft, path);
    const shared = wanted.filter(({ isShared }) => isShared);

    if (!shared.length) return wanted;

    const answer = await this.#host.ask({
      message: `${draft.name} uses shapes which you changed: ${shared.map(one => one.draft.name).join(", ")}`,
      detail: "They have files of their own, so everything which uses them changes too.",
      buttons: ["Save all", "Cancel"]
    });

    return answer === 0 ? wanted : null;
  }

  async #beside(draft, path) {
    const shapes = [...draft.shape.everything].filter(shape => shape !== draft.shape);
    const wanted = await Promise.all(shapes.map(shape => this.#target(shape, path)));

    return wanted.filter(Boolean);
  }

  async #target({ id, revision }, path) {
    const draft = this.#session.draftOf(id);
    const own = this.#paths.get(id);
    const isNear = Boolean(own) && !PNG.test(own) && folderOf(own) === folderOf(path);

    if (isNear) return { draft, path: own, isShared: !draft.isSaved };

    const beside = this.#host.beside(path, id);
    const there = await this.#host.readBeside(path, id);

    if (!there) return { draft, path: beside, isShared: false };
    if (draft.isSaved && revisionIn(there) > revision) return null;

    return { draft, path: beside, isShared: !draft.isSaved };
  }

  #current(json) {
    const rules = json.format && !json.format.id ? this.#session.book.rulesFor(json.format) : null;

    return rules ? { ...json, format: rules.reference } : json;
  }

  #renew(draft, isInside = false) {
    const wasSaved = draft.isSaved;
    const current = this.#current(draft.json);

    if (current !== draft.json) {
      draft.json.format = current.format;
      draft.refresh();
    }

    if (wasSaved) draft.markSaved();
    if (wasSaved || !(this.pathOf(draft) || isInside)) return;

    draft.json.revision = (draft.json.revision ?? 1) + 1;
    draft.refresh();
  }

  #kept(draft, path) {
    this.#paths.set(draft.id, path);
    draft.markSaved();
  }

  #origin(path) {
    const read = async key => {
      const bytes = await this.#host.readBeside(path, key);

      if (!bytes) return null;

      const json = JSON.parse(new TextDecoder().decode(bytes));

      if (!this.#paths.has(json.id)) this.#paths.set(json.id, this.#host.beside(path, key));

      return json;
    };

    return { name: folderOf(path), read, open: uri => openLink(uri) };
  }
}

async function openLink(uri) {
  if (!uri.startsWith("data:")) throw new Error("Only data which is in the file itself is read");

  const response = await fetch(uri);

  return new Uint8Array(await response.arrayBuffer());
}

function revisionIn(bytes) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)).revision ?? 1;
  } catch {
    return 0;
  }
}

function folderOf(path) {
  return path.replace(/[^\\/]+$/, "");
}

export function isAnimationFile({ name, bytes }) {
  if (!/.json$/i.test(name)) return false;

  try {
    return "plays" in JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return false;
  }
}

function movesWritten(moves) {
  if (!moves.length) return "";

  return `Its own animations were saved next to it: ${moves.map(one => one.name).join(", ")}.`;
}

function written(others) {
  if (!others.length) return "";

  return `The ${others.length === 1 ? "shape" : `${others.length} shapes`} it uses ${others.length === 1 ? "was" : "were"} saved next to it.`;
}
