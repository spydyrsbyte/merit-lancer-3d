/*
  A Player plays an animation once, or over and over, on one figure. It gives the
  pose for the moment it is at, the marks which were passed, and the figures of what
  was spawned.

  It goes by two clocks (see score.js). Slices are how much of it is done, and whoever
  plays it moves them on. Milliseconds are the time since the loop began.

  The origin is where the shape stands. What is spawned is in the world. The points
  are given by the game, as places measured from the shape, or as actors.

  It can be about one place, such as "hand-left" (see core/motion/anatomy.js).

  Whether it loops is what its file says, unless it was told otherwise.

  Each loop has a score of its own, as chances can come out differently. They are
  worked out from the seed, so whoever has the same one sees the same.

  Reach says how far it can go before it comes to a mark, so it can stop right there.

  A joint which faces a point turns around its up and then tips, over FACING slices.
  What faces where something is now comes after the pose: take it, then aim.
*/

import { Figure, Pose, Transform, Turn } from "../../shape-core/src/index.js";
import { Points } from "./points.js";
import { Score } from "./score.js";

const FACING = 6;
const DEGREES = 180 / Math.PI;
const CENTER = [0, 0, 0];
const THINNEST = 0.001;
const STRAIGHT = 5;
const CLOCKS = ["slices", "milliseconds"];

export class Player {
  #figure;
  #rules;
  #library;
  #scores = new Map();
  #spawned = new Map();
  #marked = { slices: 0, milliseconds: 0 };
  #loopMarked = 0;
  #points;
  #origin;

  constructor(animation, figure, rules, library, { seed = "", place = "", origin = new Transform(), points = {}, loop = animation.loop } = {}) {
    this.animation = animation;
    this.loop = loop;
    this.seed = seed;
    this.place = place;
    this.slices = 0;
    this.milliseconds = 0;

    this.#figure = figure;
    this.#rules = rules;
    this.#library = library;

    this.#points = new Points(figure, rules, this.#score("slices").cast, { start: CENTER, end: CENTER, ...points }, origin);
    this.#points.keep(animation.pointNames);
    this.origin = origin;
  }

  get origin() {
    return this.#origin;
  }

  set origin(value) {
    this.#origin = value;
    this.#points.move(value);
  }

  get moment() {
    const { length } = this.animation;

    if (!this.loop) return Math.min(this.slices, length);

    return (this.slices % length + length) % length;
  }

  get done() {
    return !this.loop && this.slices >= this.animation.length;
  }

  get figures() {
    return [...this.#spawned.values()].filter(Boolean).map(one => one.figure);
  }

  advance(slices, milliseconds) {
    const loop = this.#loop;

    this.slices += slices;
    this.milliseconds = this.#loop === loop ? this.milliseconds + milliseconds : 0;
  }

  reach(name, slices, milliseconds) {
    const given = { slices, milliseconds };
    const shares = CLOCKS.flatMap(clock => {
      const step = given[clock];

      if (!(step > 0)) return [];

      const now = this.#now(clock);
      const ahead = this.#score(clock).marks.filter(mark => mark.name === name).map(mark => this.#distance(clock, now, mark.at));

      return ahead.filter(distance => distance >= 0 && distance < step).map(distance => distance / step);
    });

    if (!shares.length) return null;

    const share = Math.min(...shares);

    return { slices: slices * share, milliseconds: milliseconds * share };
  }

  get passed() {
    const loop = this.#loop;
    const isNewLoop = loop !== this.#loopMarked;

    this.#loopMarked = loop;

    return CLOCKS.flatMap(clock => {
      const { marks } = this.#score(clock);
      const from = isNewLoop && clock === "milliseconds" ? 0 : this.#marked[clock];
      const to = this.#now(clock);

      this.#marked[clock] = to;

      if (to < from) return marks.filter(mark => mark.at >= from || mark.at < to);

      return marks.filter(mark => mark.at >= from && mark.at < to);
    });
  }

  get pose() {
    const bends = new Map();
    const glows = new Map();

    for (const clock of CLOCKS) {
      const score = this.#score(clock);
      const valueOf = track => this.#valueOf(track, clock) ?? 0;

      for (const [joint, { turn, move }] of score.bends) {
        const before = bends.get(joint) ?? { turn: CENTER, move: CENTER };

        bends.set(joint, { turn: turn.map((track, i) => before.turn[i] + valueOf(track)), move: move.map((track, i) => before.move[i] + valueOf(track)) });
      }

      for (const [target, { track }] of score.glows) glows.set(target, this.#valueOf(track, clock));
    }

    return new Pose(added(bends, this.#aimed(false)), new Map([...glows].filter(([, glow]) => glow.strength > 0)));
  }

  get aim() {
    return new Pose(added(new Map(), this.#aimed(true)));
  }

  spawn() {
    const current = new Set();

    for (const clock of CLOCKS) {
      const now = this.#now(clock);

      this.#score(clock).spawns.forEach((spawn, index) => {
        if (now < spawn.begins || now >= spawn.until || this.done) return;

        const key = `${clock}/${this.#loop}/${index}`;

        current.add(key);

        if (!this.#spawned.has(key)) this.#spawned.set(key, this.#appear(spawn));
        if (this.#spawned.get(key)) this.#move(this.#spawned.get(key), spawn, clock);
      });
    }

    for (const key of this.#spawned.keys()) {
      if (!current.has(key)) this.#spawned.delete(key);
    }
  }

  get #loop() {
    return this.loop ? Math.floor(this.slices / this.animation.length) : 0;
  }

  #now(clock) {
    return clock === "slices" ? this.moment : this.milliseconds;
  }

  #distance(clock, now, at) {
    const { length } = this.animation;

    if (clock !== "slices" || !this.loop) return at - now;

    return ((at - now) % length + length) % length;
  }

  #valueOf(track, clock) {
    if (!track) return undefined;

    const { length } = this.animation;

    return clock === "slices" ? track.at(this.moment, length, this.loop) : track.at(this.milliseconds, Infinity, false);
  }

  #score(clock) {
    const key = `${clock}/${this.seed}/${this.#loop}`;

    if (!this.#scores.has(key)) this.#scores.set(key, new Score(this.animation, this.#figure, this.#rules, `${this.seed}/${this.#loop}`, this.place, clock, this.loop));

    return this.#scores.get(key);
  }

  #aimed(now) {
    const score = this.#score("slices");
    const { moment } = this;
    const isWanted = ({ point }) => isNow(point) === now;

    const faced = score.faces.filter(face => isWanted(face) && moment >= face.at).map(({ joint, at, point }) => {
      const seen = this.#seen(joint, point);

      if (!seen) return null;

      const amount = Math.min(1, (moment - at) / FACING);

      return [joint, [seen.tip * amount, 0, seen.around * amount]];
    });

    const turned = [...score.turns.values()].filter(isWanted).map(({ joint, point, track }) => {
      const seen = this.#seen(joint, point);

      if (!seen) return null;

      return [joint, [0, 0, sideOf(seen.around) * this.#valueOf(track, "slices")]];
    });

    return [...faced, ...turned].filter(Boolean);
  }

  #seen(joint, point) {
    const piece = this.#figure.pieces.find(one => one.name === joint);
    const there = this.#points.find(point);

    if (!piece || !there) return null;

    return toward(piece.parent.base.times(piece.stance), there);
  }

  #appear({ use, path }) {
    const shape = this.#library.find(use);

    if (!shape) return null;

    return { figure: new Figure(shape), base: this.#socket(path) };
  }

  #socket(path) {
    const socket = this.#figure.sockets.find(one => one.path === path);

    return socket ? Transform.at(socket.place.origin, socket.place.turn) : this.origin;
  }

  #move(one, spawn, clock) {
    const now = this.#now(clock);
    const travel = this.#score(clock).travel.get(spawn.name);
    const base = spawn.attached ? this.#socket(spawn.path) : one.base;
    const valueOf = track => track.at(now, Infinity, false);

    const step = Transform.at(travel.move.map(valueOf), Turn.degrees(travel.turn.map(valueOf)));
    const size = [...travel.size.at(now, Infinity, false)];

    let place = base.times(step);

    if (travel.to.length) {
      const path = travel.to.map(({ at, point }) => ({ at, place: this.#points.find(point) ?? place.origin }));

      place = new Transform(place.axes, along(path, spawn.begins, place.origin, now));
    }

    const aim = travel.face.findLast(({ at }) => at <= now) ?? travel.reach.findLast(({ at }) => at <= now) ?? travel.to[0];
    const there = aim ? this.#points.find(aim.point) : null;

    if (there) place = turnedTo(place, travel.to.length ? base.origin : place.origin, there);

    const reach = travel.reach.findLast(({ at }) => at <= now);
    const end = reach ? this.#points.find(reach.point) : null;

    if (end) size[1] = distance(place.origin, end);

    one.figure.place(place.times(Transform.sized(size.map(number => Math.max(number, THINNEST)))));
    one.figure.take(this.#glowOf(spawn.name, one.figure, clock));
  }

  #glowOf(name, figure, clock) {
    const glow = this.#valueOf(this.#score(clock).glows.get(name)?.track, clock);

    if (!glow?.strength) return new Pose();

    return new Pose(new Map(), new Map(figure.shape.parts.map(placement => [placement.id, glow])));
  }
}

function along(path, begin, start, now) {
  const before = path.findLast(({ at }) => at <= now);
  const next = path.find(({ at }) => at > now);
  const here = before ? before.place : start;

  if (!next) return here;

  const from = before ? before.at : begin;
  const amount = (now - from) / (next.at - from);

  return here.map((number, i) => number + (next.place[i] - number) * amount);
}

function added(bends, turns) {
  for (const [joint, degrees] of turns) {
    const bend = bends.get(joint) ?? { turn: CENTER, move: CENTER };

    bends.set(joint, { ...bend, turn: bend.turn.map((number, i) => number + degrees[i]) });
  }

  return bends;
}

function isNow(point) {
  return point.endsWith(":now");
}

function sideOf(around) {
  return Math.abs(around) < STRAIGHT ? 0 : Math.sign(around);
}

function toward(place, point) {
  const away = point.map((number, i) => number - place.origin[i]);
  const [x, y, z] = place.turn.inverse.apply(away);

  return { around: Math.atan2(-x, y) * DEGREES, tip: Math.atan2(z, Math.hypot(x, y)) * DEGREES };
}

function turnedTo(place, from, point) {
  if (distance(from, point) < THINNEST) return place;

  const { around, tip } = toward(Transform.at(from), point);

  return Transform.at(place.origin, Turn.degrees([tip, 0, around]));
}

function distance(a, b) {
  return Math.hypot(...a.map((number, i) => number - b[i]));
}
