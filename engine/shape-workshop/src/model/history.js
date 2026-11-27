/*
  The History is what can be undone and redone. It keeps states as they are given.
*/

const MOST = 200;

export class History {
  #before = [];
  #after = [];

  get canUndo() {
    return this.#before.length > 0;
  }

  get canRedo() {
    return this.#after.length > 0;
  }

  push(state) {
    this.#before.push(state);
    this.#after = [];

    if (this.#before.length > MOST) this.#before.shift();
  }

  undo(now) {
    if (!this.canUndo) return null;

    this.#after.push(now);

    return this.#before.pop();
  }

  redo(now) {
    if (!this.canRedo) return null;

    this.#before.push(now);

    return this.#after.pop();
  }
}
