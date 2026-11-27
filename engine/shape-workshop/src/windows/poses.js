/*
  The poses of the shape. It only knows joints, so whoever makes a pose does not have
  to think about what the shape is made of.

  A pose can be additive and an overlay, for how animations go to it (see core
  motion/animation.js).

  Dragging a limb bends its joint (see view/bender.js). Bending the shape as it was built
  starts a new pose.
*/

import { Figure, Pose } from "../../../shape-core/src/index.js";
import { directions, rulesOf } from "../model/words.js";
import { button, checkField, el, heading, iconButton, note, redraw, sliderField, textField } from "../panels/ui.js";
import { icon } from "../panels/icons.js";
import { freeName } from "../model/names.js";
import { View, VIEWS } from "../view/view.js";
import { axesOf, bendable, grabLimb } from "../view/bender.js";
import { edgesOf } from "../view/edges.js";
import { Floating } from "./floating.js";

const AXES = ["x", "y", "z"];
const LABELS = { "turn x": "Swing", "turn y": "Spread", "turn z": "Twist", "move x": "Left and right", "move y": "Back and forward", "move z": "Down and up" };
const STILL = [0, 0, 0];
const SELECTED = "#f0a63a";

export class Poses extends Floating {
  #workshop;
  #view = null;
  #stage;
  #list;
  #joints;
  #shape = null;
  #pose = "";
  #joint = "";

  constructor(parent, workshop) {
    super(parent, { title: "Poses", width: 900, height: 600, className: "poses" });

    this.#workshop = workshop;
    this.#list = el("div", { className: "pose-list" });
    this.#stage = el("div", { className: "stage" }, this.#views(), el("p", { className: "hint over", textContent: "Drag a limb to bend it · Drag beside it to turn the view · Scroll to zoom" }));
    this.#joints = el("div", { className: "joint-panel" });
    this.body.append(this.#list, this.#stage, this.#joints);
  }

  open() {
    super.open();

    this.#view ??= new View(this.#stage, {
      grab: at => this.#grab(at),
      click: at => this.#click(at),
      draw: context => this.#draw(context)
    });

    this.refresh();
    this.#view.look("angled");
  }

  close() {
    this.#view?.close();

    for (const canvas of this.#stage.querySelectorAll("canvas")) canvas.remove();

    this.#view = null;
    super.close();
  }

  refresh() {
    const { draft } = this.#workshop;

    if (!this.isOpen || !this.#view) return;
    if (!draft) return this.close();

    this.title = `Poses: ${draft.name}`;

    if (this.#shape?.id !== draft.shape.id) {
      this.#pose = draft.json.poses?.[draft.json.pose] ? draft.json.pose : "";
      this.#joint = "";
    }

    if (this.#shape !== draft.shape) {
      this.#shape = draft.shape;
      this.#view.show(new Figure(draft.shape, this.#workshop.paints.surroundings, false));
    }

    if (!this.#poses[this.#pose]) this.#pose = "";

    this.#show();
    this.#redrawSides();
  }

  get #poses() {
    return this.#workshop.draft.json.poses ?? {};
  }

  get #bends() {
    return this.#poses[this.#pose]?.joints ?? {};
  }

  get #movements() {
    const found = new Map();

    for (const { movement } of this.#shape.limbs) {
      if (movement && !found.has(movement.name)) found.set(movement.name, movement);
    }

    return found;
  }

  #show() {
    this.#view.figure.take(Pose.read(this.#bends));
    this.#view.moved();
  }

  #redrawSides() {
    redraw(this.#list, this.#poseList());
    redraw(this.#joints, this.#jointList());
  }

  #views() {
    const all = Object.entries(VIEWS).map(([name, { label }]) => button(label, () => this.#view.look(name)));

    return el("div", { className: "views" }, ...all);
  }

  #poseList() {
    const usual = this.#workshop.draft.json.pose ?? "";
    const entries = [["", "As built"], ...Object.entries(this.#poses).map(([slug, { name }]) => [slug, name ?? slug])];
    const isBuilt = !this.#pose;

    return [
      heading("Poses"),
      el("ol", { className: "entries", data: { scroll: "poses" } }, ...entries.map(([slug, name]) => this.#poseRow(slug, name, slug === usual))),
      button("New pose", () => this.#add(), { symbol: "plus" }),
      button("Make it the usual one", () => this.#workshop.setShape({ pose: this.#pose }), { symbol: "star", disabled: this.#pose === usual, title: "The shape starts in this pose" }),
      isBuilt ? null : textField("Name", this.#poses[this.#pose].name, { key: "pose name", done: name => this.#change({ name: name || this.#pose }) }),
      isBuilt ? null : checkField("Additive", this.#poses[this.#pose].additive === true, on => this.#change({ additive: on || undefined }), "In an animation, its values are added to what plays, instead of being gone to"),
      isBuilt ? null : checkField("Overlay", this.#poses[this.#pose].overlay !== false, on => this.#change({ overlay: on ? undefined : false }), "In an animation, only the joints it names move. Off: every other joint goes back to where it started"),
      isBuilt ? null : button("Delete", () => this.#remove(), { symbol: "trash" })
    ];
  }

  #poseRow(slug, name, isUsual) {
    const choose = () => {
      this.#pose = slug;
      this.refresh();
    };

    return el("li", { className: slug === this.#pose ? "current" : "", on: { click: choose } },
      el("span", { className: "name", textContent: name }), isUsual ? icon("star") : null);
  }

  #jointList() {
    const movements = this.#movements;
    const movement = movements.get(this.#joint);

    const rows = [...movements.keys()].map(name => el("li", {
      className: name === this.#joint ? "current" : "",
      on: { click: () => this.#choose(name) }
    }, el("span", { className: "name", textContent: name })));

    return [
      heading("Joints"),
      el("ol", { className: "entries", data: { scroll: "joints" } }, ...rows, rows.length ? null : el("li", { className: "empty", textContent: "This shape has no joints yet." })),
      ...movement ? this.#axisFields(movement) : [note("Click a limb or a name to choose a joint.")]
    ];
  }

  #axisFields(movement) {
    const rules = rulesOf(this.#shape, this.#workshop.session.book);
    const words = directions(movement.name, rules);
    const bend = this.#bends[movement.name] ?? {};

    const fields = axesOf(movement).map(({ kind, axis, low, high }) => {
      const key = `${kind} ${axis}`;
      const said = words[key] ? [words[key]["-"], words[key]["+"]].filter(Boolean).join(" / ") : LABELS[key];
      const index = AXES.indexOf(axis);

      return sliderField(said, bend[kind]?.[index] ?? 0, {
        low, high,
        set: number => this.#bend(movement.name, kind, index, number),
        done: () => this.#workshop.done()
      });
    });

    return [
      heading(movement.name),
      ...fields,
      button("Straighten this joint", () => {
        this.#setBend(movement.name, null);
        this.#workshop.done();
      }, { symbol: "reset" })
    ];
  }

  #choose(name) {
    this.#joint = name;
    this.#redrawSides();
    this.#view.draw();
  }

  #add() {
    const name = `Pose ${Object.keys(this.#poses).length + 1}`;
    const slug = freeName("pose", new Set(Object.keys(this.#poses)));
    const joints = structuredClone(this.#bends);

    this.#pose = slug;
    this.#workshop.setShape({ poses: { ...this.#poses, [slug]: { name, joints } } });
  }

  #change(values) {
    this.#workshop.setShape({ poses: { ...this.#poses, [this.#pose]: { ...this.#poses[this.#pose], ...values } } });
  }

  #remove() {
    const { [this.#pose]: gone, ...poses } = this.#poses;
    const { pose } = this.#workshop.draft.json;
    const usual = pose === this.#pose ? { pose: "" } : {};

    this.#pose = "";
    this.#workshop.setShape({ poses, ...usual });
  }

  #bend(joint, kind, index, number) {
    const { turn = STILL, move = STILL } = this.#bends[joint] ?? {};
    const now = { turn: [...turn], move: [...move] };

    now[kind][index] = number;
    this.#setBend(joint, now);
  }

  #setBend(joint, bend) {
    if (!this.#pose) {
      if (!bend) return;

      this.#pose = freeName("pose", new Set(Object.keys(this.#poses)));
    }

    const old = this.#poses[this.#pose] ?? { name: `Pose ${Object.keys(this.#poses).length + 1}`, joints: {} };
    const { [joint]: before, ...others } = old.joints ?? {};
    const joints = bend ? { ...others, [joint]: bend } : others;

    this.#workshop.livePoses({ ...this.#poses, [this.#pose]: { ...old, joints } });
    this.#shape = this.#workshop.draft.shape;
    this.#show();
  }

  #grab(at) {
    return grabLimb(this.#view, at, {
      bends: () => this.#bends,
      set: (name, bend) => {
        this.#joint = name;
        this.#setBend(name, bend);
      },
      moved: () => this.#redrawSides(),
      done: isMoved => isMoved && this.#workshop.done()
    });
  }

  #click(at) {
    const hit = this.#view.pick(at);
    const piece = hit && bendable(hit.piece);

    this.#choose(piece?.name ?? "");
  }

  #draw(context) {
    const { figure } = this.#view;

    if (!this.#joint) return;

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
}
