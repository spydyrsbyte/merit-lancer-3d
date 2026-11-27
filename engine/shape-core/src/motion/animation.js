/*
  An Animation is the file which says how something moves. Nothing here plays it.
  That is up to the game.

    plays     which animation of its rules this is
    requires  what has to be there: joints, what is on them (see requirement.js), and
              points of the game, such as "points.target"
    optional  what it also has something for. It is for whoever reads it.
    length    in slices, and whether it loops
    define    animations with a name, to be played by joints
    steps     what happens, each "at" a slice, or "on" a millisecond

  A slice is how much of an animation is done. One is about 2 units of the shape as it
  was built, and grows with the shape, so a walk which takes 30 slices goes about 60
  units, and the feet of a larger mech go as much further. Whoever plays it says how
  many slices go by: from a clock, or from how far something went. "on" is for what
  goes by the clock anyway, such as a flash.

  A step can go to a pose of the shape, by its name. Unless the pose is additive, the
  joints end up just as the pose has them. Unless it is not an overlay, only the joints
  it names move, and the others go on with what they do. An animation which is meant
  for many shapes can only use poses which their rules list.

  A step names joints, and what is attached to a joint is inside of it. Amounts are
  measured from the pose, in the words of the rules, in degrees or units, or as a
  share of how far the joint can go that way, such as "40%". What is not there is ignored. A
  step can also use the name of a requirement, and the keyword of a shape inside of
  the joint it hangs on.
    { "at": 0.3, "hip01": { "up": 20, "knee": { "back": 30 } } }

  A joint, or a step, can also have:
    play     definitions, or other animations by id. Of those with the same "at",
             one is picked by its weight. It has to be over by the next "at".
    glow     what shines, by name: a color, strength and reach
    mark     the name of a moment, for the game
    to       move to a point
    face     turn toward a point, all the way, or by so many degrees to the side:
             { "points.me.sword": 30 }, where less than nothing is away from it
    reach    stretch to a point       size     stretch
    spawn    shapes which appear, each with a name that later steps can use
    despawn  the name of one which is gone
    pose     the name of a pose, only in a step
  The points "start", "end" and "me" are always there, and me is whoever does it. A
  point can be inside of another, as "points.me.sword". It is where that was when the
  animation started, and with ":now" where it is after each moment is worked out.

  The demand is how much it asks for: how many joints, and how much on them.

  Problems are what is wrong with the file, as far as that can be seen. They are
  warnings. Other words are the business of the rules.

  Files of version 1 counted in seconds, and are read with 30 slices to a second.
*/

import { Heading } from "../file/heading.js";
import { parseName } from "../file/words.js";
import { list, number, record, text } from "../input/clean.js";
import { Requirement } from "./requirement.js";
import { inSlices } from "./slices.js";

const POINT = /^points\.([a-z][a-z0-9-]*)$/i;
const ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

const NOTHING = "nothing";
const ALWAYS = ["points.start", "points.end", "points.me"];
const INSIDE = /^(points\.[^.:]+)(?:\.[^:]+)?(?::now)?$/;
const TO_POINTS = ["to", "face", "reach"];
const ACTIONS = ["at", "on", "play", "glow", "mark", "to", "face", "reach", "size", "spawn", "despawn", "pose"];
const VERSION = { major: 2, minor: 0 };
const LONGEST = 100000;

export class Animation extends Heading {
  constructor(given) {
    super(given, "Animation", VERSION);

    const json = inSlices(given, VERSION);

    this.plays = text(json.plays, "");
    this.points = texts(json.requires).filter(need => POINT.test(need));
    this.requirements = others(json.requires).map(Requirement.read).filter(Boolean);
    this.unclear = others(json.requires).filter(need => !Requirement.read(need));
    this.optional = texts(json.optional);
    this.length = number(json.length, 30, 0.01, LONGEST);
    this.loop = json.loop === true;
    this.define = Object.fromEntries(Object.entries(record(json.define)).map(([name, one]) => [name, readDefinition(one)]));
    this.steps = readSteps(json.steps);
    this.meta = record(json.meta);
  }

  get requires() {
    return [...this.requirements, ...this.points];
  }

  get keywords() {
    return new Set(this.requirements.flatMap(requirement => requirement.keywords));
  }

  get demand() {
    return this.requirements.reduce((sum, { amount, has }) => sum + amount.minimum + has.length, 0);
  }

  get firstJoint() {
    return this.requirements[0]?.component ?? "";
  }

  get marks() {
    const parts = this.#allSteps().flatMap(step => [...partsOf(step)]);

    return [...new Set(parts.map(part => part.mark).filter(Boolean))];
  }

  get poses() {
    return [...new Set(this.#allSteps().map(step => step.pose).filter(Boolean))];
  }

  get problems() {
    const found = new Set(this.unclear.map(need => `requires ${JSON.stringify(need)} cannot be read`));

    for (const step of this.#allSteps()) this.#checkStep(step, found);

    this.#checkTimes(found);

    return [...this.headingWarnings, ...[...found].map(problem => `${this.name}: ${problem}`)];
  }

  fits(anatomy) {
    return this.requirements.every(requirement => requirement.isMet(anatomy));
  }

  wordsUnknownTo(rules) {
    const unknown = new Set();

    const named = new Map(this.requirements.map(({ name, component }) => [name, component]));

    for (const { joint: name, words } of this.#movements()) {
      const joint = named.get(name.replace(/\d+$/, "")) ?? name;
      const isJoint = rules.knows(joint);

      for (const word of words) {
        if (isJoint && !rules.direction(joint, word)) unknown.add(`${joint} ${word}`);
      }

      if (!isJoint && !this.#spawned().has(joint) && !rules.keywords.includes(joint)) unknown.add(joint);
    }

    return [...unknown];
  }

  toJSON() {
    const { plays, requires, optional, length, loop, define, steps, meta } = this;

    return { ...this.heading, plays, requires, optional, length, loop, define, steps, meta };
  }

  get pointNames() {
    const parts = this.#allSteps().flatMap(step => [...partsOf(step)]);

    return [...new Set(parts.flatMap(part => TO_POINTS.flatMap(action => pointsOf(part[action]))))];
  }

  #allSteps() {
    return [...this.steps, ...Object.values(this.define).flatMap(one => one.steps)];
  }

  #spawned() {
    const parts = this.#allSteps().flatMap(step => [...partsOf(step)]);

    return new Set(parts.flatMap(part => Object.keys(record(part.spawn))));
  }

  *#movements() {
    for (const step of this.#allSteps()) {
      for (const [joint, value] of inside(step)) yield* movementsOf(joint, value);
    }
  }

  #checkStep(step, found) {
    for (const part of partsOf(step)) {
      for (const action of TO_POINTS) {
        for (const point of pointsOf(part[action])) {
          if (!this.#hasPoint(point)) found.add(`${action} ${point} is not in requires or optional`);
        }
      }

      for (const { use } of list(part.play).map(record)) {
        if (!this.define[use] && !ID.test(use) && use !== NOTHING) found.add(`there is no definition ${use}`);
      }

      const gone = part.despawn;

      if (gone !== undefined && !this.#spawned().has(gone)) found.add(`${gone} is never spawned`);
    }
  }

  #hasPoint(point) {
    const known = [...ALWAYS, ...this.points, ...this.optional];
    const whole = INSIDE.exec(point)?.[1] ?? point;

    return known.includes(point) || known.includes(whole);
  }

  #checkTimes(found) {
    for (const [joint, plays] of this.#playsByJoint()) {
      const starts = [...new Set(plays.map(play => play.at))].sort((a, b) => a - b);
      const after = this.loop ? starts[0] + this.length : this.length;

      for (const { use, at } of plays) {
        const next = starts.find(start => start > at) ?? after;
        const lasts = this.define[use]?.length ?? 0;

        if (lasts > next - at + 1e-6) found.add(`${use} on ${joint} is not over by the next at`);
      }
    }
  }

  #playsByJoint() {
    const found = new Map();

    for (const step of this.steps.filter(one => one.on === undefined)) {
      for (const [joint, value] of inside(step)) {
        const plays = list(value.play).map(record).map(play => ({ ...play, at: step.at + number(play.at, 0) }));

        if (plays.length) found.set(joint, [...found.get(joint) ?? [], ...plays]);
      }
    }

    return found;
  }
}

function others(value) {
  return list(value).filter(need => !POINT.test(need));
}

function texts(value) {
  return list(value).filter(entry => typeof entry === "string");
}

function readDefinition(json) {
  const given = record(json);

  return { length: number(given.length, 30, 0.01, LONGEST), steps: readSteps(given.steps) };
}

function readSteps(json) {
  const steps = list(json).map(record).map(step => {
    if (typeof step.on === "number") return { ...step, on: number(step.on, 0, 0, LONGEST * 1000) };

    return { ...step, at: number(step.at, 0, 0, LONGEST) };
  });

  return steps.sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.on ?? 0) - (b.on ?? 0));
}

function inside(value) {
  return Object.entries(value).filter(([key, one]) => !ACTIONS.includes(key) && isObject(one));
}

function* partsOf(value) {
  yield value;

  for (const [, one] of inside(value)) yield* partsOf(one);
}

function* movementsOf(joint, value) {
  const words = Object.keys(value).filter(key => !ACTIONS.includes(key) && !isObject(value[key]));

  yield { joint, words };

  for (const [inner, one] of inside(value)) yield* movementsOf(inner, one);
}

function pointsOf(value) {
  if (value === undefined) return [];

  return isObject(value) ? Object.keys(value) : [value];
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
