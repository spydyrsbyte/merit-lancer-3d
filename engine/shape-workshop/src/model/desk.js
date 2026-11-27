/*
  The Desk opens, saves and closes: shapes and rules. It asks the host for files, and
  says what went wrong instead of failing.

  Adding shapes is opening them without leaving the current one, to be placed in it.

  Animations which are opened go to the Animation window. Saving one writes its file.

  Save writes the file. A shape inside of another, which has no file of its own, is
  saved in the file of what it is in. Save as gives it a file of its own.

  The host is told which rules files are loaded, so that it can remember them. Rules
  which a shape follows and which are not loaded, or which loaded rules are built on, are
  asked of the host, if it knows where they are.
*/

import { BUILTINS, STANDARD_NAMES } from "../../../shape-core/src/index.js";
import { Files, isAnimationFile } from "./files.js";

const SAVE = 0;
const DISCARD = 1;
const DEEPEST = 8;

export class Desk {
  #workshop;
  #session;
  #host;
  #rules = new Map();

  constructor(workshop, session, host) {
    this.#workshop = workshop;
    this.#session = session;
    this.#host = host;

    this.files = new Files(session, host);
  }

  get unsaved() {
    return this.#session.tabs.filter(draft => !draft.isSaved);
  }

  get unsavedAnimations() {
    return [...this.#session.animations.values()].filter(draft => !draft.isSaved);
  }

  start() {
    this.#session.start();
    this.#workshop.switched();
  }

  show(draft) {
    this.#session.current?.end();
    this.#session.show(draft);
    this.#workshop.switched();
    this.#fetchRules();
  }

  showShape(id) {
    this.show(this.#session.draftOf(id));
  }

  enter(id) {
    const { kind, value } = this.#session.current.get(id) ?? {};

    if (kind !== "shape" || BUILTINS.has(value.use) || !this.#session.library.find(value.use)) return;

    const { figure } = this.#workshop.view;
    const thing = this.#session.current.thing(id);
    const draft = this.#session.draftOf(value.use);

    draft.surroundings = Object.fromEntries(STANDARD_NAMES.map(name => [name, figure.material(thing.materialOf(name))]));
    draft.cameFrom = this.#session.current;
    this.show(draft);
  }

  async openFiles() {
    await this.open(await this.#host.pickShapes());
  }

  async open(files) {
    const blank = this.#blank;
    const moves = files.filter(isAnimationFile);

    let opened = null;

    for (const file of moves) opened = await this.#try(() => this.files.openAnimation(file)) ?? opened;

    if (moves.length) await this.#workshop.showAnimation(opened?.id ?? "");

    opened = null;

    for (const file of files.filter(file => !moves.includes(file))) opened = await this.#try(() => this.files.open(file)) ?? opened;

    if (!opened) return;
    if (blank) this.#session.close(blank);

    this.show(opened);
  }

  async addShapes() {
    const { current } = this.#session;
    const files = await this.#host.pickShapes();

    for (const file of files) await this.#try(() => this.files.open(file));

    this.show(current);
    this.#workshop.openWindow("shapes");
  }

  async save(asNew = false) {
    const { current } = this.#session;

    if (!current) return false;

    const holder = asNew ? null : this.files.holderOf(current);
    const note = await this.#try(() => this.files.save(holder ?? current, asNew));
    const isDone = typeof note === "string";
    const where = holder ? ` in ${holder.name}` : "";

    if (isDone) this.#workshop.say(`Saved ${current.name}${where}. ${note}`);

    this.#workshop.refresh();

    return isDone;
  }

  async saveAnimation(draft, asNew = false) {
    const path = await this.#try(() => this.files.saveAnimation(draft, asNew));

    if (path) this.#workshop.say(`Saved the animation ${draft.name}.`);

    this.#workshop.refresh();

    return Boolean(path);
  }

  async close(draft) {
    if (!await this.#mayClose(draft)) return false;

    this.#session.close(draft);

    if (!this.#session.tabs.length) this.#session.start();

    this.#workshop.switched();

    return true;
  }

  async closeAll() {
    for (const draft of this.unsaved) {
      if (!await this.#mayClose(draft)) return false;
    }

    for (const draft of this.unsavedAnimations) {
      if (!await this.#mayLeave(draft)) return false;
    }

    return true;
  }

  async loadRules() {
    await this.openRules(await this.#host.pickRules());
  }

  async openRules(files) {
    for (const { name, path, bytes } of files) {
      const rules = await this.#try(() => this.#session.openRules(new TextDecoder().decode(bytes)), name);

      if (rules && path) this.#rules.set(rules.id, path);
    }

    this.#rulesChanged();
    await this.#fetchRules();
  }

  removeRules(id) {
    this.#session.book.remove(id);
    this.#rules.delete(id);
    this.#rulesChanged();
  }

  async #fetchRules() {
    if (!this.#host.findRules) return;

    const found = [];
    const places = [];

    for (let step = 0; step < DEEPEST; step++) {
      const [wanted] = this.#wantedRules;
      const file = wanted && await this.#try(() => this.#host.findRules(wanted));

      if (!file) break;

      const rules = await this.#try(() => this.#session.openRules(new TextDecoder().decode(file.bytes)), file.name);

      if (!rules || found.includes(rules.name)) break;

      this.#rules.set(rules.id, file.path);
      found.push(rules.name);
      places.push(`${rules.name} from ${file.path}`);
    }

    if (!found.length) return;

    this.#rulesChanged();
    this.#workshop.say(`Loaded the rules ${places.join(", and ")}.`);
  }

  get #wantedRules() {
    const { book, current } = this.#session;
    const format = current?.json.format;
    const isMissing = format && (!book.rulesFor(format) || book.isOther(format));

    return [...isMissing ? [format] : [], ...book.missingBases];
  }

  #rulesChanged() {
    this.#host.rulesChanged?.([...this.#rules.values()]);
    this.#workshop.refreshWords();
  }

  get #blank() {
    const { current } = this.#session;
    const isBlank = current?.isSaved && !current.items.length && !this.files.pathOf(current);

    return isBlank ? current : null;
  }

  async #mayClose(draft) {
    draft.end();

    if (draft.isSaved) return true;

    const answer = await this.#host.ask({
      message: `${draft.name} has unsaved changes.`,
      detail: "Save them before closing?",
      buttons: ["Save", "Discard", "Cancel"]
    });

    if (answer === DISCARD) draft.revert();
    if (answer !== SAVE) return answer === DISCARD;

    this.show(draft);

    return this.save();
  }

  async #mayLeave(draft) {
    draft.end();

    const answer = await this.#host.ask({
      message: `The animation ${draft.name} has unsaved changes.`,
      detail: "Save them before closing?",
      buttons: ["Save", "Discard", "Cancel"]
    });

    if (answer === DISCARD) return true;
    if (answer !== SAVE) return false;

    return this.saveAnimation(draft);
  }

  async #try(action, name = "") {
    try {
      return await action();
    } catch (error) {
      this.#workshop.say(name ? `${name}: ${error.message}` : error.message);

      return null;
    }
  }
}
