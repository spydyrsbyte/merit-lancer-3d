/*
  What every file starts with, whether it is a shape, an animation or rules:
    version   of the way files are written
    format    the rules it follows, if it follows any: their id, their name for
              people, and the revision they were made with
    id        a uuid
    revision  which one is newer, of two with the same id
    name
    author

  The rules are found by their id. Older files only have a name, and are found by
  that. What a file says about the version of its rules is not kept, as the revision
  says it now. So every file which is saved again is brought up to date.

  A version has a major and a minor number. A higher minor one means something was
  added which is not known here, and the rest still works. A higher major one means
  that things have changed their meaning, so the file cannot be read. An older one is
  read, and written the newer way.
*/

import { number, record, text } from "../input/clean.js";
import { Author } from "./author.js";
import { uuid } from "./uuid.js";

const FIRST = { major: 1, minor: 0 };

export class Heading {
  #known;

  constructor(json, usualName, known = FIRST) {
    const given = json.version ? readVersion(json.version) : known;

    if (given.major > known.major) throw new Error(`version ${given.major} is newer than this program`);

    this.#known = known;
    this.version = given.major < known.major ? { ...known } : { ...given };

    this.format = readFormat(json.format);
    this.id = text(json.id, "") || uuid();
    this.revision = number(json.revision, 1);
    this.name = text(json.name, usualName);
    this.author = new Author(json.author);
  }

  get headingWarnings() {
    if (this.version.minor <= this.#known.minor) return [];

    return [`${this.name}: some of it is newer than this program`];
  }

  get heading() {
    const { version, format, id, revision, name, author } = this;

    return format ? { version, format, id, revision, name, author } : { version, id, revision, name, author };
  }
}

export function readVersion(json) {
  const { major, minor } = record(json);

  return { major: number(major, 1, 0), minor: number(minor, 0, 0) };
}

export function readFormat(json) {
  const given = record(json);
  const id = text(given.id, "");
  const name = text(given.name, "");
  const revision = number(given.revision, 0, 0);

  if (!id && !name) return null;

  return { ...id ? { id } : {}, name, ...revision ? { revision } : {} };
}
