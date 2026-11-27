/*
  Motion is what every mech moves by: the rules of LANCER, built on those of mecha, and
  the animations which come with the module, each taken into its slot of the rules if it
  fits (see shape-core's motion/rules.js). Those which do not are in the notes, with why.

  It is loaded once. Each mech's library gets the animations as one more source, so its
  actor finds them by id as well as by what they play.

  read is how a file of the module is read: fetch in Foundry, the disk in a test.
*/

import { Library, RuleBook, Shelf } from "../../engine/shape-core/src/index.js";

const RULES = ["engine/shape-core/rules/mecha.json", "engine/shape-core/rules/lancer.json"];
const ANIMATIONS = "animations";

export class Motion {
  constructor(rules, shelf, notes, files) {
    this.rules = rules;
    this.shelf = shelf;
    this.notes = notes;
    this.files = files;
  }

  static async load(read) {
    const book = new RuleBook();

    for (const path of RULES) book.add(await read(path));

    const rules = book.find("lancer");
    const shelf = new Shelf();
    const library = new Library([shelf]);
    const names = await read(`${ANIMATIONS}/index.json`);
    const notes = [];
    const files = [];

    for (const name of names) {
      const json = await read(`${ANIMATIONS}/${name}`);

      shelf.put(json);
      files.push(json);

      const { animation, reason } = await library.animation(json.id);
      const result = animation ? rules.take(animation) : { taken: false, reasons: [reason] };

      if (!result.taken) notes.push(`${name}: ${result.reasons.join(", ")}`);
    }

    return new Motion(rules, shelf, notes, files);
  }
}

export const RULES_FILES = RULES;
