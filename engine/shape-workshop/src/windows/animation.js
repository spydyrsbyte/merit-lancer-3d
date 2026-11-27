/*
  The Animation window makes and changes animations, on the shape which is being built.

  On the left are the animations which are open, and the shape's own (see
  panels/animation-list.js). In the middle is the shape, as the animation has it at the
  slice which is shown, with what it spawned, and the timeline under it (see
  panels/timeline.js). On the right is the step which is chosen (panels/moments.js), or
  the animation itself when none is (panels/animation-settings.js).

  Dragging a limb bends its joint at the slice which is shown (see view/bender.js): into
  the step at that slice, which is made if there is none, in the part of it which moves
  just that joint, or a new one with the name of the joint. Amounts are measured from
  the pose the shape starts in, and written in the words of its rules.

  It can start from any pose of the shape, and play, over and over or once, at a speed.
  A target, in front of the shape unless it is moved, is where points.target is, so
  facing and reaching can be seen.

  Animations are opened from files, or offered by the host, and saved through it (see
  model/files.js). The host can offer some with:
    animations()   the JSON of animation files

  Keys pressed in the window are its own: undo, redo and save are those of the
  animation, space plays, and Delete removes the chosen step.
*/

import { Cast } from "../../../shape-animation/src/cast.js";
import { Player } from "../../../shape-animation/src/player.js";
import { Animation, Figure, Pose, Rules, uuid } from "../../../shape-core/src/index.js";
import { partsOf, sortSteps, stepAt, timelineOf, wordsOf, writeBend } from "../model/steps.js";
import { rulesOf } from "../model/words.js";
import { animationList } from "../panels/animation-list.js";
import { settingsPanel } from "../panels/animation-settings.js";
import { momentPanel } from "../panels/moments.js";
import { timelinePanel } from "../panels/timeline.js";
import { button, checkField, el, list, numberInput, redraw, select, sliderField } from "../panels/ui.js";
import { bendable, grabLimb } from "../view/bender.js";
import { edgesOf } from "../view/edges.js";
import { View, VIEWS } from "../view/view.js";
import { Floating } from "./floating.js";

const USUAL_SPEED = 0.03;
const LONGEST_STEP = 100;
const DIGITS = 100;
const NEW_LENGTH = 30;
const IN_FRONT = [0, 150, 0];
const SELECTED = "#f0a63a";
const VERSION = { major: 2, minor: 0 };
const TEXT = "input:not([type=checkbox], [type=color], [type=range]), textarea, select";

export class AnimationWindow extends Floating {
  #workshop;
  #host;
  #view = null;
  #stage;
  #left;
  #right;
  #bar;
  #lanes;
  #lists;
  #offered = false;
  #chosen = "";
  #scope = "";
  #time = 0;
  #step = -1;
  #joint = "";
  #playing = false;
  #loop = true;
  #speed = 1;
  #pose = "";
  #target = [...IN_FRONT];
  #frame = null;
  #figure = null;
  #figureKey = null;
  #player = null;
  #playerKey = null;

  constructor(parent, workshop, host) {
    super(parent, { title: "Animation", width: 1260, height: 780, className: "animation" });

    this.#workshop = workshop;
    this.#host = host;
    this.#left = el("div", { className: "animation-list" });
    this.#right = el("div", { className: "animation-side" });
    this.#stage = el("div", { className: "stage" }, this.#views());
    this.#bar = el("div", { className: "animation-bar" });
    this.#lanes = el("div", { className: "animation-lanes" });
    this.#lists = el("div");
    this.body.append(this.#left, el("div", { className: "animation-middle" }, this.#stage, this.#bar, this.#lanes), this.#right, this.#lists);
    this.element.addEventListener("keydown", event => this.#key(event));
  }

  async open() {
    super.open();

    this.#view ??= new View(this.#stage, {
      grab: at => this.#grab(at),
      click: at => this.#click(at),
      draw: context => this.#outline(context)
    });

    await this.#offer();
    this.refresh();
    this.#view.look("angled");
  }

  close() {
    this.#stop();
    this.#view?.close();

    for (const canvas of this.#stage.querySelectorAll("canvas")) canvas.remove();

    this.#view = null;
    super.close();
  }

  show(id) {
    this.#stop();
    this.#chosen = id;
    this.#scope = "";
    this.#time = 0;
    this.#step = -1;
    this.refresh();
  }

  refresh() {
    if (!this.isOpen || !this.#view) return;
    if (!this.#workshop.draft) return this.close();

    if (this.#chosen && !this.draft) this.#chosen = "";
    if (this.#scope && !this.json?.define?.[this.#scope]) this.#scope = "";
    if (!this.step) this.#step = -1;

    this.title = this.draft ? `Animation: ${this.draft.name} on ${this.#workshop.draft.name}` : `Animation: ${this.#workshop.draft.name}`;

    redraw(this.#left, animationList(this));
    redraw(this.#right, this.step ? momentPanel(this) : settingsPanel(this));
    redraw(this.#bar, this.#barContent());
    redraw(this.#lanes, this.draft ? [timelinePanel(this)] : []);
    redraw(this.#lists, this.#suggestions());

    if (!this.#playing) this.#showMoment();
  }

  get draft() {
    return this.#workshop.session.animations.get(this.#chosen) ?? null;
  }

  get json() {
    return this.draft?.json ?? null;
  }

  get animations() {
    return [...this.#workshop.session.animations.values()];
  }

  get chosen() {
    return this.#chosen;
  }

  get scope() {
    return this.#scope;
  }

  get definitions() {
    return Object.keys(this.json?.define ?? {});
  }

  get timeline() {
    return this.json ? timelineOf(this.json, this.#scope) : null;
  }

  get steps() {
    return this.timeline?.steps ?? [];
  }

  get length() {
    return this.timeline?.length ?? NEW_LENGTH;
  }

  get time() {
    return this.#time;
  }

  get step() {
    return this.steps[this.#step] ?? null;
  }

  get joint() {
    return this.#joint;
  }

  get rules() {
    return rulesOf(this.#workshop.draft.shape, this.#workshop.session.book);
  }

  get rulesName() {
    return this.rules?.name ?? "";
  }

  get canFollow() {
    const { rules, json } = this;

    return Boolean(rules && json) && json.format?.id !== rules.id;
  }

  get slots() {
    return Object.keys(this.rules?.slots ?? {});
  }

  get own() {
    return this.#workshop.draft.json.animations ?? {};
  }

  get joints() {
    return [...new Set(this.#shownFigure().pieces.map(piece => piece.name).filter(Boolean))];
  }

  get poses() {
    return Object.keys(this.#workshop.draft.json.poses ?? {});
  }

  get spawned() {
    const names = this.steps.flatMap(step => [step, ...partsOf(step).map(({ part }) => part)].flatMap(part => Object.keys(part.spawn ?? {})));

    return [...new Set(names)];
  }

  get fits() {
    const { rules, draft } = this;

    if (!rules || !draft) return [];

    const copy = new Rules(rules.toJSON());
    const fresh = rules.base ? copy.on(rules.base) : copy;
    const { taken, reasons } = fresh.take(draft.animation, { own: Object.values(this.own).includes(draft.id) });

    return taken ? [] : reasons;
  }

  choose(index, joint) {
    this.#step = index;
    this.#time = this.steps[index]?.at ?? (this.steps[index]?.on ?? 0) * USUAL_SPEED;

    if (joint) this.#joint = joint;

    this.refresh();
  }

  setTime(slice) {
    this.#time = slice;
    this.#step = stepAt(this.steps, slice);
    this.refresh();
  }

  moveStep(index, slice, isDone) {
    const step = this.steps[index];

    if (!step || step.on !== undefined) return;

    this.draft.live(json => {
      const steps = timelineOf(json, this.#scope).steps;
      const moved = steps[index];

      moved.at = slice;
      sortSteps(steps);
      this.#step = steps.indexOf(moved);
    });

    this.#time = slice;

    if (isDone) this.draft.end();

    this.refresh();
  }

  touches(step) {
    const found = new Set();

    for (const { path } of partsOf(step)) for (const name of this.#resolve(path)) found.add(name);

    return found;
  }

  partsFor(joint) {
    if (!this.step) return [];

    return partsOf(this.step).map(({ path, part }) => ({ path, part, joints: this.#resolve(path) })).filter(({ joints }) => joints.includes(joint));
  }

  wordsFor(joint) {
    return wordsOf(this.rules, joint);
  }

  edit(action) {
    const index = this.#step;

    this.#change(json => {
      const steps = timelineOf(json, this.#scope).steps;
      const step = steps[index];

      action(step);
      sortSteps(steps);
      this.#step = steps.indexOf(step);
    });
  }

  removeStep() {
    const index = this.#step;

    this.#change(json => timelineOf(json, this.#scope).steps.splice(index, 1));
    this.#step = -1;
    this.refresh();
  }

  copyStep() {
    const copy = structuredClone(this.step);
    const at = round(this.#time);

    delete copy.on;
    copy.at = at;

    this.#change(json => {
      const steps = timelineOf(json, this.#scope).steps;
      const there = stepAt(steps, at);

      if (there >= 0) steps.splice(there, 1);

      steps.push(copy);
      sortSteps(steps);
      this.#step = stepAt(steps, at);
    });
  }

  addPart(joint) {
    this.edit(step => {
      step[joint] ??= {};
    });
  }

  addStep() {
    const at = round(this.#time);

    this.#change(json => {
      const timeline = timelineOf(json, this.#scope);

      timeline.steps ??= [];

      if (stepAt(timeline.steps, at) < 0) timeline.steps.push({ at });

      sortSteps(timeline.steps);
      this.#step = stepAt(timeline.steps, at);
    });
  }

  setSetting(changes) {
    this.#change(json => {
      Object.assign(json, changes);

      for (const [key, value] of Object.entries(json)) if (value === undefined) delete json[key];
    });
  }

  setLength(slices, scope) {
    this.#change(json => {
      timelineOf(json, scope).length = slices;
    });
  }

  setScope(name) {
    this.#stop();
    this.#scope = name;
    this.#step = -1;
    this.#time = 0;
    this.refresh();
  }

  addDefinition(name) {
    if (this.json.define?.[name]) return this.setScope(name);

    this.#change(json => {
      json.define = { ...json.define, [name]: { length: NEW_LENGTH, steps: [] } };
    });
    this.setScope(name);
  }

  removeDefinition(name) {
    this.#change(json => {
      delete json.define[name];

      if (!Object.keys(json.define).length) delete json.define;
    });
    this.setScope("");
  }

  fillRequires() {
    const touched = new Set(this.steps.flatMap(step => [...this.touches(step)]));

    for (const definition of Object.values(this.json.define ?? {})) {
      for (const step of definition.steps ?? []) for (const name of this.touches(step)) touched.add(name);
    }

    const counts = new Map();

    for (const name of touched) {
      const word = name.split("-")[0].replace(/\d+$/, "");

      counts.set(word, (counts.get(word) ?? 0) + 1);
    }

    const joints = [...counts].map(([word, count]) => `${word}:${String(count).padStart(2, "0")}`);
    const points = this.draft.animation.points.filter(point => !["points.start", "points.end", "points.me"].includes(point.split(/[.:]/).slice(0, 2).join(".")));
    const named = (this.json.requires ?? []).filter(one => typeof one !== "string");

    this.setSetting({ requires: [...joints, ...new Set(points), ...named] });
  }

  followRules() {
    this.setSetting({ format: this.rules.reference });
  }

  create(plays, isOwn = false) {
    const { rules } = this;
    const json = {
      version: VERSION, id: uuid(), revision: 1, name: plays ? `${this.#workshop.draft.name} ${plays}` : "New animation",
      author: { ai: 0 }, plays: plays || this.slots[0] || "idle", requires: [], optional: [], length: NEW_LENGTH,
      loop: Boolean(rules?.slots[plays]?.loop), steps: []
    };

    if (rules) json.format = rules.reference;

    this.#workshop.session.keepAnimation(json, false);

    if (isOwn) this.#workshop.setShape({ animations: { ...this.own, [json.plays]: json.id } });

    this.show(json.id);
  }

  copy() {
    const json = { ...structuredClone(this.json), id: uuid(), revision: 1, name: `${this.draft.name} copy` };

    this.#workshop.session.keepAnimation(json, false);
    this.show(json.id);
  }

  async save(asNew) {
    if (this.draft) await this.#workshop.desk.saveAnimation(this.draft, asNew);

    this.refresh();
  }

  undo() {
    this.draft?.undo();
    this.refresh();
  }

  redo() {
    this.draft?.redo();
    this.refresh();
  }

  async openFiles() {
    await this.#workshop.desk.open(await this.#host.pickShapes());
  }

  setOwn(slot, id) {
    const own = { ...this.own };
    const isRuleSlot = this.slots.includes(slot);

    if (id || !isRuleSlot) own[slot] = id;
    else delete own[slot];

    this.#workshop.setShape({ animations: Object.keys(own).length ? own : undefined });
  }

  addSlot(name) {
    this.create(name, true);
  }

  say(text) {
    this.#workshop.say(text);
  }

  async #offer() {
    if (this.#offered || !this.#host.animations) return;

    this.#offered = true;

    for (const json of await this.#host.animations()) this.#workshop.session.keepAnimation(json, true);
  }

  #change(action) {
    try {
      this.draft.change(action);
    } catch (error) {
      this.say(error.message);
    }

    this.refresh();
    this.#workshop.refresh();
  }

  #resolve(path) {
    const { rules } = this;

    if (!rules) return [];

    const cast = new Cast(this.#shownFigure(), rules, this.#shownAnimation(), "");

    let pieces = null;

    for (const key of path) {
      pieces = cast.find(key, pieces);

      if (!pieces.length) return [];
    }

    return [...new Set(pieces.map(piece => piece.name).filter(Boolean))];
  }

  #shownFigure() {
    const { shape } = this.#workshop.draft;
    const key = `${shape.stamp}/${this.#pose}`;

    if (this.#figure?.shape === shape && this.#figureKey === key) return this.#figure;

    const standing = this.#pose ? Object.create(shape, { pose: { value: this.#pose } }) : shape;

    this.#figure = new Figure(standing, this.#workshop.paints.surroundings);
    this.#figureKey = key;

    return this.#figure;
  }

  #shownAnimation() {
    const { draft } = this;

    if (!draft || !this.#scope) return draft?.animation ?? null;

    const definition = draft.json.define[this.#scope];

    return new Animation({ ...draft.json, length: definition.length ?? NEW_LENGTH, steps: definition.steps ?? [] });
  }

  #shownPlayer() {
    const animation = this.#shownAnimation();
    const figure = this.#shownFigure();
    const { rules } = this;

    if (!animation || !rules) return null;

    const key = [animation, figure, this.#target.join()];

    if (this.#player && this.#playerKey?.every((one, i) => one === key[i])) return this.#player;

    this.#player = new Player(animation, figure, rules, this.#workshop.session.library, { seed: animation.id, points: { target: [...this.#target] } });
    this.#playerKey = key;

    return this.#player;
  }

  #showMoment() {
    if (!this.#view) return;

    const figure = this.#shownFigure();
    const player = this.#shownPlayer();

    figure.take(new Pose());

    if (player) {
      player.slices = this.#time;
      player.milliseconds = this.#time / USUAL_SPEED;

      const pose = player.pose;
      const { aim } = player;

      figure.take(aim.bends.size ? pose.plus(aim) : pose);
      player.spawn();
    }

    this.#view.others = player?.figures ?? [];

    if (this.#view.figure === figure) this.#view.moved();
    else this.#view.show(figure);
  }

  #bendsNow() {
    const bends = {};

    for (const [joint, { turn, move }] of this.#shownPlayer()?.pose.bends ?? []) bends[joint] = { turn: [...turn], move: [...move] };

    return bends;
  }

  #bendAt(name, bend) {
    const at = round(this.#time);
    const { rules } = this;

    this.draft.live(json => {
      const timeline = timelineOf(json, this.#scope);

      timeline.steps ??= [];

      if (stepAt(timeline.steps, at) < 0) timeline.steps.push({ at });

      sortSteps(timeline.steps);

      const index = stepAt(timeline.steps, at);
      const step = timeline.steps[index];
      const exact = partsOf(step).find(({ path }) => {
        const joints = this.#resolve(path);

        return joints.length === 1 && joints[0] === name;
      });

      const part = exact?.part ?? (step[name] = {});

      writeBend(part, rules, name, bend);
      this.#step = index;
    });

    this.#joint = name;
    this.#showMoment();
  }

  #grab(at) {
    if (!this.draft || !this.rules || this.#playing) return null;

    return grabLimb(this.#view, at, {
      bends: () => this.#bendsNow(),
      set: (name, bend) => this.#bendAt(name, bend),
      moved: () => {
        redraw(this.#right, momentPanel(this));
        redraw(this.#lanes, [timelinePanel(this)]);
      },
      done: isMoved => {
        if (isMoved) this.draft.end();

        this.refresh();
        this.#workshop.refresh();
      }
    });
  }

  #click(at) {
    const hit = this.#view.pick(at);
    const piece = hit && bendable(hit.piece);

    this.#joint = piece?.name ?? "";
    this.refresh();
  }

  #outline(context) {
    const figure = this.#view?.figure;

    if (!figure || !this.#joint) return;

    context.strokeStyle = SELECTED;
    context.lineWidth = 1.5 * this.#view.ratio;
    context.beginPath();

    for (const piece of figure.pieces.filter(one => one.name === this.#joint)) {
      for (const [start, end] of edgesOf(piece.mesh)) {
        context.moveTo(...this.#view.project(piece.world.point(start)));
        context.lineTo(...this.#view.project(piece.world.point(end)));
      }
    }

    context.stroke();
  }

  #barContent() {
    const poses = this.poses.map(slug => [slug, this.#workshop.draft.json.poses[slug].name ?? slug]);

    return [
      button(this.#playing ? "Pause" : "Play", () => this.#playing ? this.#stop(true) : this.#play(), { symbol: this.#playing ? "close" : "reset", disabled: !this.draft || !this.rules, title: "Space" }),
      el("label", { className: "field row" }, el("span", { textContent: "Slice" }),
        numberInput(this.#time, { key: "animation time", min: 0, step: 1, set: number => this.setTime(Math.max(0, Math.min(this.length, number))) })),
      checkField("Loop", this.#loop, on => {
        this.#loop = on;
      }),
      sliderField("Speed", this.#speed, { low: 0.1, high: 3, step: 0.05, set: number => {
        this.#speed = number;
      } }),
      el("label", { className: "field row" }, el("span", { textContent: "Starts in" }),
        select(this.#pose, [["", "Its usual pose"], ...poses], slug => {
          this.#pose = slug;
          this.refresh();
        }, "animation start pose")),
      el("label", { className: "field row", title: "Where points.target is, from the middle of the shape: right, forward and up" }, el("span", { textContent: "Target" }),
        ...this.#target.map((number, axis) => numberInput(number, { key: `target ${axis}`, step: 10, set: value => {
          this.#target[axis] = value;
          this.#showMoment();
        } })))
    ];
  }

  #suggestions() {
    const definitions = this.definitions;
    const points = ["points.target", "points.target:now", "points.start", "points.end", "points.me", ...this.joints.map(name => `points.me.${name}`), ...(this.rules?.points ?? []).map(point => `points.${point}`)];
    const shapes = this.#workshop.session.shapes.map(shape => shape.id);

    return [
      list("animation-slots", this.slots),
      list("animation-points", [...new Set(points)]),
      list("animation-definitions", definitions),
      list("animation-shapes", shapes)
    ];
  }

  #play() {
    if (!this.draft || this.#playing) return;

    const home = this.element.ownerDocument.defaultView;

    if (this.#time >= this.length) this.#time = 0;

    this.#playing = true;
    this.#step = -1;
    this.refresh();

    let last = home.performance.now();

    const step = now => {
      if (!this.#playing) return;

      const milliseconds = Math.min(now - last, LONGEST_STEP);

      last = now;
      this.#time += milliseconds * USUAL_SPEED * this.#speed;

      if (this.#time >= this.length) {
        if (!this.#loop) return this.#stop(true, this.length);

        this.#time %= this.length;
      }

      this.#showMoment();
      this.#moveHeads();
      this.#frame = home.requestAnimationFrame(step);
    };

    this.#frame = home.requestAnimationFrame(step);
  }

  #stop(isShown = false, at = this.#time) {
    if (!this.#playing) return;

    this.element.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
    this.#playing = false;
    this.#frame = null;
    this.#time = round(at);

    if (isShown) this.refresh();
  }

  #moveHeads() {
    const left = `${Math.max(0, Math.min(1, this.#time / this.length)) * 100}%`;

    for (const head of this.#lanes.querySelectorAll(".head")) head.style.left = left;

    const label = this.#lanes.querySelector(".ruler .label");

    if (label) label.textContent = `Slice ${round(this.#time)} of ${this.length}`;
  }

  #key(event) {
    const key = event.key.toLowerCase();
    const isCommand = event.ctrlKey || event.metaKey;
    const isTyping = event.target.matches(TEXT);

    event.stopPropagation();

    if (isCommand && key === "s") {
      event.preventDefault();

      return this.save(event.shiftKey);
    }

    if (isTyping) return;

    if (isCommand && (key === "y" || (key === "z" && event.shiftKey))) {
      event.preventDefault();

      return this.redo();
    }

    if (isCommand && key === "z") {
      event.preventDefault();

      return this.undo();
    }

    if (key === " ") {
      event.preventDefault();

      return this.#playing ? this.#stop(true) : this.#play();
    }

    if ((key === "delete" || key === "backspace") && this.step) this.removeStep();
  }

  #views() {
    const all = Object.entries(VIEWS).map(([name, { label }]) => button(label, () => this.#view?.look(name)));

    return el("div", { className: "views" }, ...all);
  }
}

function round(slice) {
  return Math.round(slice * DIGITS) / DIGITS;
}
