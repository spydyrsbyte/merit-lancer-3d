/*
  A RuleBook is several rules at once. Those which are built on others in it are
  merged with them, whatever order they were added in.

  Rules are kept by their id, so two rules with the same name can both be in it. They
  are found by their id, or by their name if that is all there is: for a format, or a
  basis, of a file which is older than ids.

  Rules whose basis is not in the book are used as they are, and say so in the
  warnings.
*/

import { Rules } from "./rules.js";

export class RuleBook {
  #files = new Map();

  get names() {
    return [...this.#files.values()].map(({ name }) => name);
  }

  get all() {
    return [...this.#files.keys()].map(id => this.find(id));
  }

  get warnings() {
    const missing = [...this.#files.values()].filter(({ basis }) => basis && !this.#lookup(basis));

    return missing.map(({ name, basis }) => `${name} is built on ${basis.name}, which is not loaded`);
  }

  get missingBases() {
    const bases = [...this.#files.values()].map(({ basis }) => basis).filter(basis => basis && !this.#lookup(basis));

    return bases;
  }

  add(json) {
    const rules = new Rules(json);

    this.#files.set(rules.id, rules);

    return rules;
  }

  remove(id) {
    this.#files.delete(id);
  }

  find(key) {
    const rules = this.#files.get(key) ?? this.#named(key);

    return rules ? this.#merged(rules, []) : null;
  }

  rulesFor(format) {
    const rules = format && this.#lookup(format);

    return rules ? this.#merged(rules, []) : null;
  }

  isOther(format) {
    return Boolean(format?.id) && !this.#files.has(format.id) && Boolean(this.#named(format.name));
  }

  #lookup({ id, name }) {
    return (id && this.#files.get(id)) || this.#named(name);
  }

  #named(name) {
    return [...this.#files.values()].find(rules => rules.name === name) ?? null;
  }

  #merged(rules, trail) {
    if (trail.includes(rules)) return null;

    const basis = rules.basis && this.#lookup(rules.basis);
    const base = basis ? this.#merged(basis, [...trail, rules]) : null;

    return base ? rules.on(base) : rules;
  }
}
