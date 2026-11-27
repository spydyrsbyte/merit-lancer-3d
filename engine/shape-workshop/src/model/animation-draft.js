/*
  An AnimationDraft is an animation while it is being made. The JSON is what counts, and
  the animation is read from it again after every change, so it can be played as it is.

  A change is one step of undo, and dragging is many small changes between begin and
  end, as with a shape (see draft.js). A change which leaves the file unreadable is
  taken back.

  Problems are what the engine says is wrong with the file. They are warnings.
*/

import { Animation } from "../../../shape-core/src/index.js";
import { History } from "./history.js";

export class AnimationDraft {
  #history = new History();
  #pending = null;
  #saved;

  constructor(json, isSaved = false) {
    this.json = structuredClone(json);
    this.refresh();
    this.#saved = isSaved ? this.#state : null;
  }

  get id() {
    return this.json.id;
  }

  get name() {
    return this.json.name || this.json.id;
  }

  get isSaved() {
    return this.#state === this.#saved;
  }

  get canUndo() {
    return this.#history.canUndo || this.#pending !== null;
  }

  get canRedo() {
    return this.#history.canRedo;
  }

  get problems() {
    return this.animation.problems ?? [];
  }

  refresh() {
    this.animation = new Animation(this.json);
  }

  markSaved() {
    this.#saved = this.#state;
  }

  change(action) {
    this.end();
    this.begin();

    try {
      action(this.json);
      this.refresh();
    } catch (error) {
      this.json = JSON.parse(this.#pending);
      this.#pending = null;
      this.refresh();

      throw error;
    }

    this.end();
  }

  live(action) {
    this.begin();
    action(this.json);
    this.refresh();
  }

  begin() {
    this.#pending ??= this.#state;
  }

  end() {
    const before = this.#pending;

    this.#pending = null;

    if (before !== null && before !== this.#state) this.#history.push(before);
  }

  undo() {
    this.end();
    this.#restore(this.#history.undo(this.#state));
  }

  redo() {
    this.end();
    this.#restore(this.#history.redo(this.#state));
  }

  #restore(state) {
    if (state === null) return;

    this.json = JSON.parse(state);
    this.refresh();
  }

  get #state() {
    return JSON.stringify(this.json);
  }
}
