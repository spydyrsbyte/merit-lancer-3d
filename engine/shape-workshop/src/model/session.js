/*
  A Session is all which is open: shapes as drafts, animations as drafts of their own
  (see animation-draft.js), and rules.

  Some drafts have a tab, and others were only made along the way, such as a leg which
  was made from parts of a mech. A shape which is open is the one which others use, so
  a change to a leg shows in every mech which has it.

  It does not know where files come from. Whoever opens one gives its bytes, and may
  say how to find the shapes it uses, by their keys.

  A picture brings the shape's own animations along, and they are open from then on.
*/

import { Library, Picture, RuleBook, Shape, Shelf, uuid } from "../../../shape-core/src/index.js";
import { AnimationDraft } from "./animation-draft.js";
import { Draft } from "./draft.js";

const PNG = 0x89;
const PERSON = { ai: 0 };
const VERSION = { major: 2, minor: 0 };

export class Session {
  #shelf = new Shelf();
  #drafts = new Map();
  #origins = new Set();

  constructor() {
    this.library = new Library([this.#shelf]);
    this.book = new RuleBook();
    this.animations = new Map();
    this.tabs = [];
    this.current = null;
  }

  get shapes() {
    const all = new Set(this.tabs.flatMap(draft => [...draft.shape.everything]));

    for (const draft of this.#drafts.values()) if (!draft.isSaved) all.add(draft.shape);

    const newest = new Map([...all].map(shape => [shape.id, this.library.find(shape.id) ?? shape]));

    return [...newest.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  start(name = "New shape") {
    const json = {
      version: VERSION, id: uuid(), revision: 1, name, author: PERSON,
      shapes: [], sockets: [], plugs: [], insignia: [], materials: {}, poses: {}
    };

    const rules = this.book.all.at(0);

    if (rules) json.format = rules.reference;

    const draft = new Draft(this.library, json, true);

    this.keep(draft);
    this.show(draft);

    return draft;
  }

  async open(bytes, origin = null) {
    const isPicture = bytes[0] === PNG;
    const shape = isPicture ? await this.#openPicture(bytes) : await this.#openText(bytes, origin);
    const draft = this.draftOf(shape.id, true);

    for (const other of this.#drafts.values()) other.refresh();

    this.show(draft);

    return draft;
  }

  keepAnimation(json, isSaved = true) {
    const known = this.animations.get(json.id);

    if (known && (!known.isSaved || (known.json.revision ?? 1) >= (json.revision ?? 1))) return known;

    const draft = new AnimationDraft(json, isSaved);

    this.animations.set(draft.id, draft);

    return draft;
  }

  openAnimation(bytes) {
    const json = JSON.parse(new TextDecoder().decode(bytes));

    if (!json.plays) throw new Error("This is not an animation");

    return this.keepAnimation(json);
  }

  ownAnimations(draft) {
    return Object.values(draft.json.animations ?? {}).map(id => this.animations.get(id)).filter(Boolean);
  }

  openRules(text) {
    return this.book.add(JSON.parse(text));
  }

  find(id) {
    return this.#drafts.get(id) ?? null;
  }

  draftOf(id, isSaved = true) {
    if (!this.#drafts.has(id)) {
      const shape = this.library.find(id);

      this.keep(new Draft(this.library, JSON.parse(JSON.stringify(shape)), isSaved));
    }

    return this.#drafts.get(id);
  }

  keep(draft) {
    this.#drafts.set(draft.id, draft);
  }

  show(draft) {
    if (!this.tabs.includes(draft)) this.tabs.push(draft);

    this.current = draft;
    draft.refresh();
  }

  close(draft) {
    const index = this.tabs.indexOf(draft);

    this.tabs = this.tabs.filter(one => one !== draft);

    if (!draft.items.length) this.#drafts.delete(draft.id);

    if (this.current === draft) this.current = this.tabs[Math.min(index, this.tabs.length - 1)] ?? null;

    this.current?.refresh();
  }

  inside(draft) {
    const others = [...draft.shape.everything].filter(shape => shape !== draft.shape);

    return others.map(shape => this.#drafts.get(shape.id) ?? null).filter(Boolean);
  }

  #assertNew(id) {
    if (this.#drafts.has(id)) this.show(this.#drafts.get(id));

    return !this.#drafts.has(id);
  }

  async #openPicture(bytes) {
    const picture = await Picture.read(bytes).catch(() => null);

    if (!picture) throw new Error("There is no shape in this picture");

    for (const json of picture.animations) this.keepAnimation(json);

    if (!this.#assertNew(picture.top)) return this.find(picture.top).shape;

    return this.library.open(bytes);
  }

  async #openText(bytes, origin) {
    const json = JSON.parse(new TextDecoder().decode(bytes));

    if (!json.shapes && !json.data?.uri) throw new Error("This is not a shape");

    const { id } = new Shape(json);

    if (!this.#assertNew(id)) return this.find(id).shape;

    if (origin && !this.#origins.has(origin.name)) {
      this.#origins.add(origin.name);
      this.library.add(sourceOf(origin));
    }

    this.library.forget(id);
    this.#shelf.put({ ...json, id });

    return this.library.load(id);
  }
}

function sourceOf({ read, open }) {
  return { read, open, mesh: () => null };
}
