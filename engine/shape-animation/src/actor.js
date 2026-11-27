/*
  An Actor is a figure which plays animations. It is the same for a fighting game, a
  side scroller, or a token on a map. Where it stands is up to whoever uses it: its
  place is set from outside (see shape-translation).

  It has rules of its own, on top of those it was given: its keywords, and the
  animations of its shape, which are in the shape's own list. A name there which the
  rules have no slot for is a slot of this actor only.

  animate starts an animation, by its name or by its id. A name is not one animation
  but whatever fits: the shape's own first, then the rules. An id is that one, and has
  to be loaded by the library first. It says whether it plays, and if not, why. What a
  name comes to is worked out once, so it costs nothing to ask for it every frame.

  What loops is its body: standing, walking, flying. Only one plays at a time, and the
  next fades in. What does not loop is an action, played over the body. It uses the
  joints it needs, and leaves the others to the body, so a mech can shoot while it
  walks. It can be done with one place, such as "hand-left", and then depends on what
  is there. Each place can have one action at a time, and a new one there replaces it.
  What two of them use, such as the waist, gets both added up.

  Time goes by with update: milliseconds, and maybe slices. Slices are how much of an
  animation is done, about 2 units of the shape as it was built. Every animation is
  started with a sliceSpeed, in slices a millisecond, and whether its speed is locked.
  One which is locked always goes at its sliceSpeed. One which is not goes by the
  slices update is given, as from how far it went, so feet do not slide, and at its
  sliceSpeed when none are given. update gives back what happened: marks which were
  passed, and the actions which are over.

  animate gives back what it started (see animated.js), to stop, pause, resume or
  speed up, or to pause on a mark: pauseOn in the options does that from the start. Its name is unique for this actor: the name it was started with and a
  number, such as "attack:3". loop in the options says whether it has no end, instead
  of what its file says. update can do the same, before time moves on, by that name,
  or by the name it was started with, which means all of those.

    actor.update(16, 3)
    actor.update(16, { slices: 3, animations: { walk: { sliceSpeed: 0.02 }, "attack:3": { action: "pause" } } })

  When the body stops, the actor goes back to how it stands, fading.

  aim is a pose laid over everything which plays, such as a waist turned toward a
  target. Whoever uses the actor sets it; it is nothing unless they do.
*/

import { Pose, Rules, SLICES_PER_SECOND, Transform } from "../../shape-core/src/index.js";
import { Animated } from "./animated.js";
import { Player } from "./player.js";

const FADE = 150;
const SLICE_SPEED = SLICES_PER_SECOND / 1000;
const SLICE = 2;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Actor {
  #library;
  #own = new Map();
  #found = new Map();
  #body = null;
  #last = null;
  #fade = 1;
  #actions = new Map();
  #count = 0;

  constructor(figure, rules, library, { id = "", size = 1 } = {}) {
    this.figure = figure;
    this.id = id;
    this.size = size;
    this.place = new Transform();
    this.aim = new Pose();
    this.rules = layered(figure.shape, rules);

    this.#library = library;
  }

  static async create(figure, rules, library, options = {}) {
    const actor = new Actor(figure, rules, library, options);
    const loaded = await actor.#loadOwn();

    return { actor, loaded };
  }

  get acting() {
    return this.#actions.size > 0;
  }

  get figures() {
    return [this.figure, ...[...this.#actions.values()].flatMap(({ player }) => player.figures)];
  }

  get playing() {
    const about = ({ name, place, state, player }) => ({ name, place, state, animation: player.animation });

    return { body: this.#body?.player.animation ?? null, actions: [...this.#actions.values()].map(about), all: this.#running.map(about) };
  }

  get #running() {
    return [this.#body, ...this.#actions.values()].filter(Boolean);
  }

  #change(name, { sliceSpeed, speedLocked, action } = {}) {
    for (const playing of this.#running.filter(one => one.name === name || one.key === name)) {
      if (sliceSpeed !== undefined) playing.setSliceSpeed(sliceSpeed);
      if (speedLocked !== undefined) playing.setSpeedLocked(speedLocked);
      if (action === "pause") playing.pause();
      if (action === "resume") playing.resume();
      if (action === "stop") playing.stop();
    }
  }

  #end(playing) {
    if (!playing.isBody) {
      if (this.#actions.get(playing.place) === playing) this.#actions.delete(playing.place);

      return;
    }

    if (this.#body !== playing) return;

    this.#last = this.#bodyPose();
    this.#body = null;
    this.#fade = 0;
  }

  slicesFor(distance) {
    return distance / (SLICE * this.size);
  }

  find(key, place = "") {
    if (ID.test(key)) return this.#library?.findAnimation(key) ?? null;

    const remembered = `${key}/${place}`;

    if (!this.#found.has(remembered)) this.#found.set(remembered, this.#own.get(key) ?? this.rules.pick(key, this.figure.shape, place));

    return this.#found.get(remembered);
  }

  animate(key, options = {}) {
    const { place = "", points = {}, sliceSpeed = SLICE_SPEED, speedLocked = false, pauseOn = "" } = options;
    const animation = this.find(key, place);

    if (!animation) return new Animated({ key, place, reason: `nothing fits ${key}` });

    const slot = this.rules.slots[animation.plays];
    const loop = options.loop ?? animation.loop;
    const isBody = options.body ?? options.loop ?? slot?.loop ?? animation.loop;

    if (isBody && this.#body?.player.animation === animation && this.#body.player.loop === loop) return this.#body;

    const player = new Player(animation, this.figure, this.rules, this.#library, { seed: `${this.id}/${key}`, place, points, origin: this.place, loop });
    const playing = new Animated({ player, sliceSpeed, speedLocked, pauseOn, key, name: `${key}:${++this.#count}`, place, isBody }, one => this.#end(one));

    if (isBody) {
      this.#body?.ended();
      this.#last = this.#bodyPose();
      this.#body = playing;
      this.#fade = 0;
    } else {
      this.#actions.get(place)?.ended();
      this.#actions.set(place, playing);
    }

    return playing;
  }

  isBusy(place = "") {
    if (!place) return this.acting;

    return this.#actions.has(place) || this.#actions.has("");
  }

  stop(place = "") {
    this.#actions.get(place)?.stop();
  }

  update(milliseconds, options) {
    const { slices, animations = {} } = typeof options === "number" ? { slices: options } : options ?? {};
    const marks = [];

    for (const [name, change] of Object.entries(animations)) this.#change(name, change);

    this.#fade = Math.min(1, this.#fade + milliseconds / FADE);

    for (const playing of this.#running.filter(one => one.isRunning)) {
      marks.push(...this.#advance(playing, milliseconds, this.#slicesOf(playing, milliseconds, slices)));
    }

    this.figure.place(this.place);
    this.#takePose();

    const finished = this.#finish();

    return { marks, finished };
  }

  async #loadOwn() {
    const loaded = [];

    for (const [plays, key] of Object.entries(this.figure.shape.animations)) {
      const { animation, reason } = this.#library ? await this.#library.animation(key) : { animation: null, reason: "there is no library" };

      if (!animation) {
        loaded.push({ plays, key, taken: false, reasons: [reason] });
        continue;
      }

      const result = this.rules.take(animation, { own: true });

      if (result.taken) this.#own.set(plays, animation);

      loaded.push({ plays, key, taken: result.taken, reasons: result.reasons });
    }

    return loaded;
  }

  #slicesOf({ sliceSpeed, speedLocked }, milliseconds, slices) {
    if (speedLocked || slices === undefined) return milliseconds * sliceSpeed;

    return slices;
  }

  #advance(playing, milliseconds, slices) {
    const { player, pauseMark } = playing;
    const reached = pauseMark ? player.reach(pauseMark, slices, milliseconds) : null;

    if (reached) {
      player.advance(reached.slices, reached.milliseconds);
      playing.reachedMark();
    } else {
      player.advance(slices, milliseconds);
    }
    player.origin = this.place;

    return player.passed;
  }

  #finish() {
    const finished = [];

    for (const [place, playing] of this.#actions) {
      const { player } = playing;

      player.spawn();

      if (!player.done) continue;

      finished.push({ name: playing.name, place, animation: player.animation });
      playing.ended();
      this.#actions.delete(place);
    }

    return finished;
  }

  #bodyPose() {
    const pose = this.#body?.player.pose ?? new Pose();

    if (this.#fade >= 1 || !this.#last) return pose;

    return this.#last.toward(pose, this.#fade);
  }

  #takePose() {
    const pose = this.#pose();

    this.figure.take(pose);

    const aims = [...this.#actions.values()].map(({ player }) => new Pose().toward(player.aim, weightOf(player)));
    const aim = aims.reduce((sum, one) => sum.plus(one), new Pose());

    if (aim.bends.size || this.aim.bends.size) this.figure.take(pose.plus(aim).plus(this.aim));
  }

  #pose() {
    const body = this.#bodyPose();

    if (!this.acting) return body;

    const actions = [...this.#actions.values()].map(({ player }) => ({ weight: weightOf(player), pose: player.pose }));
    const parts = actions.map(({ pose, weight }) => new Pose().toward(new Pose(pose.bends), weight));
    const total = parts.reduce((sum, one) => sum.plus(one), new Pose());

    const used = [...body.bends].filter(([joint]) => total.bends.has(joint)).map(([joint, bend]) => {
      const weights = actions.filter(({ pose }) => pose.bends.has(joint)).map(({ weight }) => weight);

      return [joint, scaled(bend, 1 - Math.max(...weights))];
    });

    const mixed = new Pose(new Map(used)).plus(total);
    const glows = [...body.glows, ...actions.flatMap(({ pose }) => [...pose.glows])];

    return new Pose(new Map([...body.bends, ...mixed.bends]), new Map(glows));
  }
}

function layered(shape, rules) {
  const own = new Rules({ name: shape.name, author: shape.author, keywords: shape.keywords });

  return rules ? own.on(rules) : own;
}

function weightOf({ slices, milliseconds, animation, loop }) {
  const fade = FADE / 1000 * SLICES_PER_SECOND;
  const left = loop ? Infinity : animation.length - slices;

  return Math.max(0, Math.min(1, Math.max(slices, milliseconds / 1000 * SLICES_PER_SECOND) / fade, left / fade));
}

function scaled({ turn, move }, amount) {
  return { turn: turn.map(number => number * amount), move: move.map(number => number * amount) };
}
