/*
  Rules are the contract between shapes and animations. A shape which follows them
  promises its joints, and an animation relies on them, so any walk for "mecha"
  works on any shape for "mecha" it was made for.

  They can be built on others, and then only say what is different. Lists are merged
  as sets, with the more specific rules first, so to move a word up is to list it
  again. What has a name is merged by its name, and the more specific rules win.

  They are a file with:
    basis        the rules they are built on, as a format is written (see file/heading.js)
    keywords     the words for what shapes are, the most important first
    conventions  the words which names are made of, in their order
    mirrors      the words which mean the other side, where out and turns go the
                 other way around
    movements    what the words for directions mean for a joint: "up": "+x"
    animations   the slots: what can be played, and what an animation in it has to
                 be: whether it loops, what it follows, its marks, the points it uses
    poses        the names of poses which animations for many shapes may use
    points       what a game can fill in, besides start and end

  The file says nothing about which animations there are. As they are loaded, each one
  is taken into its slot, if it fits what the slot asks for. What was not taken, and
  why, is given back. Nothing is thrown. The animations which were taken are the
  animations of the rules, and the slots are what the file calls animations.

  An animation which belongs to a shape can bring a slot of its own, and use any pose
  of that shape. A slot of its own asks for nothing.

  Of the animations which fit a shape, the one is chosen which asks for the most
  important keyword the other does not ask for. If they ask for the same, it is the
  one which asks for more of anything, such as two arms, and then the first.

  Joints are counted by their first word, as "hip-left" and "hip-right" are two
  hips the same as "hip01" and "hip02". Their order is that of the conventions and
  then of the numbers. So "hip01" in an animation is "hip-left" of such a shape.

  A file follows rules which have the id it names, or their name. Trying the name as
  well costs nothing, and an animation which does not fit is left out anyway.
*/

import { Heading, readFormat } from "../file/heading.js";
import { parseName } from "../file/words.js";
import { record, words } from "../input/clean.js";
import { Anatomy } from "./anatomy.js";

const DIRECTION = /^([+-])(m?)([xyz])$/;
const AXES = ["x", "y", "z"];
const LISTS = ["conventions", "mirrors", "keywords", "points", "poses"];
const ALWAYS = ["points.start", "points.end", "points.me"];

export class Rules extends Heading {
  constructor(json) {
    super(json, "Rules");

    this.basis = readFormat(json.basis);
    this.base = null;

    this.conventions = words(json.conventions);
    this.mirrors = words(json.mirrors);
    this.keywords = words(json.keywords);
    this.movements = record(json.movements);
    this.slots = record(json.animations);
    this.poses = words(json.poses);
    this.points = words(json.points);
    this.animations = [];
  }

  on(base) {
    const merged = new Rules(JSON.parse(JSON.stringify(this)));

    for (const name of LISTS) merged[name] = [...new Set([...this[name], ...base[name]])];

    merged.movements = mergeNamed(this.movements, base.movements);
    merged.slots = mergeNamed(this.slots, base.slots);
    merged.animations = [...new Set([...this.animations, ...base.animations])];
    merged.base = base;

    return merged;
  }

  knows(name) {
    const words = parseName(name);

    return Boolean(words) && words.every(({ word }) => this.conventions.includes(word));
  }

  follows(file) {
    const isMine = this.isNamed(file.format);

    return isMine || (this.base?.follows(file) ?? false);
  }

  isNamed(format) {
    if (!format) return false;

    return format.id === this.id || format.name === this.name;
  }

  get reference() {
    return { id: this.id, name: this.name, revision: this.revision };
  }

  counts(joints) {
    const groups = Map.groupBy(joints.filter(name => parseName(name)), name => parseName(name)[0].word);

    return new Map([...groups].map(([word, names]) => [word, names.length]));
  }

  ordered(joints, word) {
    const same = joints.filter(name => parseName(name)?.[0].word === word);

    return same.sort((a, b) => this.#compare(parseName(a), parseName(b)));
  }

  isMirrored(name) {
    return parseName(name)?.some(({ word }) => this.mirrors.includes(word)) ?? false;
  }

  direction(joint, word) {
    const first = parseName(joint)?.[0].word;
    const match = DIRECTION.exec(record(this.movements[first])[word]);

    if (!match) return null;

    const [, sign, moves, axis] = match;

    return { kind: moves ? "move" : "turn", axis: AXES.indexOf(axis), sign: sign === "-" ? -1 : 1 };
  }

  take(animation, { own = false } = {}) {
    const reasons = this.#misfits(animation, own);

    if (reasons.length) return { animation, taken: false, reasons };

    if (!this.animations.includes(animation)) this.animations.push(animation);

    return { animation, taken: true, reasons };
  }

  pick(plays, shape, place = "") {
    return this.choose(this.animations, plays, shape, place);
  }

  choose(animations, plays, shape, place = "") {
    const anatomy = new Anatomy(shape, place);

    const fitting = animations.filter(animation => {
      return animation.plays === plays && this.follows(animation) && animation.fits(anatomy);
    });

    return fitting.reduce((best, next) => best && !this.#isBetter(next, best) ? best : next, null);
  }

  toJSON() {
    const { basis, conventions, mirrors, keywords, movements, slots: animations, poses, points } = this;
    const built = basis ? { basis } : {};
    const named = poses.length ? { poses } : {};

    return { ...this.heading, ...built, conventions, mirrors, keywords, movements, animations, ...named, points };
  }

  #misfits(animation, own) {
    const slot = this.slots[animation.plays];

    if (!this.follows(animation)) return [`${animation.name} does not follow ${this.name}`];
    if (!slot && !own) return [`${this.name} has no slot ${animation.plays}`];

    const wanted = record(slot);
    const points = [...ALWAYS, ...this.points.map(point => `points.${point}`), ...words(wanted.points).map(point => `points.${point}`)];
    const poses = own ? [] : animation.poses.filter(pose => !this.poses.includes(pose));

    return [
      ...typeof wanted.loop === "boolean" && wanted.loop !== animation.loop ? [`${animation.plays} ${wanted.loop ? "loops" : "does not loop"}`] : [],
      ...words(wanted.marks).filter(mark => !animation.marks.includes(mark)).map(mark => `it has no mark ${mark}`),
      ...used(animation).filter(point => slot && !points.includes(point)).map(point => `${animation.plays} does not use ${point}`),
      ...poses.map(pose => `${this.name} has no pose ${pose}`)
    ];
  }

  #isBetter(next, best) {
    for (const word of this.keywords) {
      const has = next.keywords.has(word);

      if (has !== best.keywords.has(word)) return has;
    }

    const words = next.keywords.size - best.keywords.size;

    return (words || next.demand - best.demand) > 0;
  }

  #compare(a, b) {
    for (let i = 1; i < Math.max(a.length, b.length); i++) {
      const byWord = this.#rank(a[i]) - this.#rank(b[i]);

      if (byWord) return byWord;
    }

    for (let i = Math.max(a.length, b.length) - 1; i >= 0; i--) {
      const byNumber = (a[i]?.number ?? 0) - (b[i]?.number ?? 0);

      if (byNumber) return byNumber;
    }

    return 0;
  }

  #rank(part) {
    return part ? this.conventions.indexOf(part.word) : -1;
  }
}

function used(animation) {
  const whole = name => name.replace(/:now$/, "").split(".").slice(0, 2).join(".");

  return [...new Set([...animation.points, ...animation.pointNames].map(whole))];
}

function mergeNamed(specific, base) {
  const names = new Set([...Object.keys(specific), ...Object.keys(base)]);

  return Object.fromEntries([...names].map(name => {
    const mine = record(specific[name]);
    const theirs = record(base[name]);
    const lists = Object.keys(mine).filter(key => Array.isArray(mine[key]) && Array.isArray(theirs[key]));
    const merged = lists.map(key => [key, [...new Set([...mine[key], ...theirs[key]])]]);

    return [name, { ...theirs, ...mine, ...Object.fromEntries(merged) }];
  }));
}
