/*
  A Score is an animation written out for one figure: what every joint does when,
  with its definitions played and its chances decided.

  An animation has two clocks: slices, for the steps "at" a slice, and milliseconds,
  for those "on" one. Each has a score of its own, and their bends add up.

  An amount can be a share of how far the joint can go that way, such as "40%". So the
  same animation bends a stiff joint a little and a loose one a lot. On a joint which
  turns freely, it is a share of a full turn, and on one which moves freely, nothing.

  A step which goes to a pose puts each joint of the pose there. Unless the pose is
  additive, that is where it ends up, so what it starts in is taken away. Unless it is
  an overlay, every other joint goes back to where it started, at that moment, apart
  from what the step itself moves.

  The chance is worked out from a seed, so the same loop always looks the same.

  In a loop, what goes past its end goes on at its beginning.

  What was spawned has no rules, so its words are the plain directions below, and
  there are no turns around its own middle but the ones called turn and pitch.
*/

import { Glow } from "../../shape-core/src/index.js";
import { Cast } from "./cast.js";
import { Track } from "./track.js";

const ACTIONS = ["at", "on", "play", "glow", "mark", "to", "face", "reach", "size", "spawn", "despawn", "pose"];
const AXES = [0, 1, 2];
const STILL = [0, 0, 0];
const SHARE = /^(-?\d+(?:\.\d+)?)%$/;
const FULL_TURN = 360;
const AXIS_NAMES = ["x", "y", "z"];
const KINDS = ["turn", "move"];
const NOTHING = "nothing";

const PLAIN = {
  right: ["move", 0, 1], left: ["move", 0, -1],
  forward: ["move", 1, 1], back: ["move", 1, -1],
  up: ["move", 2, 1], down: ["move", 2, -1],
  turn: ["turn", 2, 1], pitch: ["turn", 0, 1]
};

export class Score {
  #animation;
  #rules;
  #roll;
  #figure;
  #clock;
  #loop;

  constructor(animation, figure, rules, seed, place = "", clock = "slices", loop = animation.loop) {
    this.bends = new Map();
    this.glows = new Map();
    this.faces = [];
    this.turns = new Map();
    this.marks = [];
    this.spawns = [];
    this.travel = new Map();
    this.path = [];

    this.#animation = animation;
    this.#rules = rules;
    this.#figure = figure;
    this.#clock = clock;
    this.#loop = loop;
    this.cast = new Cast(figure, rules, animation, place);
    this.#roll = randomFrom(seed);

    const isMine = step => (step.on !== undefined) === (clock === "milliseconds");

    for (const step of animation.steps.filter(isMine)) this.#readStep(step, 0, null);

    this.marks.sort((a, b) => a.at - b.at);
  }

  #readStep(step, start, pieces) {
    const at = start + (step.on ?? step.at ?? 0);

    this.#readPart(step, at, pieces);

    if (step.pose && !pieces) this.#readPose(step.pose, at);

    if (step.despawn) {
      for (const spawn of this.spawns) {
        if (spawn.name === step.despawn && spawn.until === Infinity) spawn.until = at;
      }
    }
  }

  #readPart(part, at, pieces) {
    if (part.mark) this.marks.push({ at: this.#when(at), name: part.mark, joint: pieces?.[0]?.name ?? "" });
    if (part.to && !pieces) this.path.push({ at, point: part.to });
    if (part.face) for (const piece of pieces ?? []) this.#readFace(piece.name, part.face, at);

    this.#readSpawns(part.spawn ?? {}, at, pieces);
    this.#readGlows(part.glow ?? {}, at, pieces);

    if (part.play) this.#play(part.play, at, pieces);

    for (const [key, value] of Object.entries(part)) {
      if (ACTIONS.includes(key)) continue;

      if (isAmount(value)) this.#bend(key, value, at, pieces);
      else if (this.travel.has(key)) this.#readTravel(this.travel.get(key), value, at);
      else this.#readInner(key, value, at, pieces);
    }
  }

  #readFace(joint, face, at) {
    if (typeof face === "string") {
      this.faces.push({ at, joint, point: face });

      return;
    }

    for (const [point, degrees] of Object.entries(face)) {
      const key = `${joint} ${point}`;

      if (!this.turns.has(key)) this.turns.set(key, { joint, point, track: new Track(0) });

      this.turns.get(key).track.add(this.#when(at), degrees);
    }
  }

  #readSpawns(spawns, at, pieces) {
    for (const [name, one] of Object.entries(spawns)) {
      const path = this.cast.socket(one.at, pieces)?.path ?? "";

      this.spawns.push({ name, use: one.use, path, attached: one.attached === true, begins: at, until: Infinity });
      this.travel.set(name, this.travel.get(name) ?? newTravel());
    }
  }

  #readInner(name, part, at, outer) {
    const pieces = this.cast.find(name, outer);

    if (pieces.length) this.#readPart(part, at, pieces);
  }

  #bend(word, amount, at, pieces) {
    for (const piece of pieces ?? []) {
      const direction = this.#rules.direction(piece.name, word);

      if (!direction) continue;

      const { kind, axis, sign } = direction;
      const turnsAway = kind === "turn" ? axis > 0 : axis === 0;
      const side = turnsAway && this.#rules.isMirrored(piece.name) ? -1 : 1;
      const value = typeof amount === "number" ? amount * sign * side : shareOf(amount, piece.movement, kind, axis, sign * side);

      this.#track(piece.name, kind, axis).add(this.#when(at), value);
    }
  }

  #when(at) {
    const { length } = this.#animation;

    return this.#loop && this.#clock === "slices" ? at % length : at;
  }

  #readPose(name, at) {
    const { shape } = this.#figure;
    const pose = shape.poses[name];

    if (!pose) return;

    const start = shape.poses[shape.pose]?.joints ?? {};
    const joints = new Set(this.#figure.pieces.map(piece => piece.name).filter(Boolean));

    for (const [joint, bend] of Object.entries(pose.joints)) {
      for (const kind of KINDS) {
        const from = pose.additive ? STILL : start[joint]?.[kind] ?? STILL;

        for (const axis of AXES) this.#track(joint, kind, axis).add(this.#when(at), bend[kind][axis] - from[axis]);
      }

      joints.delete(joint);
    }

    if (pose.overlay !== false) return;

    for (const joint of joints) {
      for (const kind of KINDS) {
        for (const axis of AXES) {
          const track = this.#track(joint, kind, axis);

          if (!track.has(this.#when(at))) track.add(this.#when(at), 0);
        }
      }
    }
  }

  #track(joint, kind, axis) {
    if (!this.bends.has(joint)) this.bends.set(joint, Object.fromEntries(KINDS.map(one => [one, [null, null, null]])));

    const tracks = this.bends.get(joint)[kind];

    tracks[axis] ??= new Track(0);

    return tracks[axis];
  }

  #readGlows(glows, at, pieces) {
    for (const [name, json] of Object.entries(glows)) {
      const found = this.travel.has(name) ? [] : this.cast.find(name, pieces);
      const targets = found.length ? [...new Set(found.map(piece => piece.name || piece.path.at(-1)))] : [name];

      for (const target of targets) this.#addGlow(target, json, at);
    }
  }

  #addGlow(target, json, at) {
    const known = this.glows.get(target) ?? { track: null, last: {} };
    const last = { ...known.last, ...json };
    const glow = Glow.read(last);
    const track = known.track ?? new Track(glow.off, (from, to, amount) => from.toward(to, amount));

    track.add(this.#when(at), glow);
    this.glows.set(target, { track, last });
  }

  #readTravel(travel, part, at) {
    if (part.mark) this.marks.push({ at, name: part.mark, joint: "" });
    if (part.to) travel.to.push({ at, point: part.to });
    if (part.face) travel.face.push({ at, point: part.face });
    if (part.reach) travel.reach.push({ at, point: part.reach });
    if (part.size) travel.size.add(at, part.size);

    for (const [word, amount] of Object.entries(part)) {
      if (!PLAIN[word] || typeof amount !== "number") continue;

      const [kind, axis, sign] = PLAIN[word];

      travel[kind][axis].add(at, amount * sign);
    }
  }

  #play(plays, at, pieces) {
    const groups = Map.groupBy(plays, play => play.at ?? 0);

    for (const [later, choices] of groups) {
      const always = choices.filter(play => play.weight === undefined);
      const chances = choices.filter(play => play.weight !== undefined);
      const chosen = chances.length ? [...always, this.#pick(chances)] : always;

      for (const { use } of chosen) this.#playOne(use, at + later, pieces);
    }
  }

  #playOne(use, at, pieces) {
    const definition = this.#animation.define[use];

    if (use === NOTHING || !definition) return;

    const started = new Set();

    for (const step of definition.steps) {
      for (const [joint, kind, axis] of this.#touched(step, pieces)) {
        const key = [joint, kind, axis].join();

        if (!started.has(key) && step.at > 0) this.#track(joint, kind, axis).pause(this.#when(at));

        started.add(key);
      }
    }

    for (const step of definition.steps) this.#readStep(step, at, pieces);
  }

  *#touched(part, pieces) {
    for (const [key, value] of Object.entries(part)) {
      if (ACTIONS.includes(key)) continue;

      if (!isAmount(value)) {
        yield* this.#touched(value, this.cast.find(key, pieces));
        continue;
      }

      for (const piece of pieces ?? []) {
        const direction = this.#rules.direction(piece.name, key);

        if (direction) yield [piece.name, direction.kind, direction.axis];
      }
    }
  }

  #pick(chances) {
    const total = chances.reduce((sum, play) => sum + play.weight, 0);

    let left = this.#roll() * total;

    for (const play of chances) {
      left -= play.weight;

      if (left < 0) return play;
    }

    return chances.at(-1);
  }
}

function isAmount(value) {
  return typeof value === "number" || (typeof value === "string" && SHARE.test(value));
}

function shareOf(amount, movement, kind, axis, way) {
  const share = Number(SHARE.exec(amount)[1]) / 100;
  const range = movement?.[kind]?.[AXIS_NAMES[axis]];

  if (range === "free") return kind === "turn" ? share * FULL_TURN * way : 0;
  if (!range) return 0;

  return share * (way > 0 ? Math.max(range[1], 0) : Math.min(range[0], 0));
}

function newTravel() {
  const axes = () => [new Track(0), new Track(0), new Track(0)];

  return { move: axes(), turn: axes(), size: new Track([1, 1, 1], blendPoints), to: [], face: [], reach: [] };
}

function blendPoints(from, to, amount) {
  return from.map((number, i) => number + (to[i] - number) * amount);
}

function randomFrom(seed) {
  let state = 2166136261;

  for (const letter of String(seed)) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);

  return () => {
    state = Math.imul(state ^ state >>> 15, 2246822507) + 0x9e3779b9 | 0;

    const mixed = Math.imul(state ^ state >>> 13, 3266489909);

    return ((mixed ^ mixed >>> 16) >>> 0) / 4294967296;
  };
}
