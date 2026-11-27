/*
  The Workshop is the editor of shapes, in an element of a page. It knows no files, no
  library and no addresses, and remembers nothing. All of that is up to its host (see
  model/files.js).

  On the left is the list of what is in the shape, in the middle the view, and on the
  right the properties. Materials, shapes, poses and rules are windows of their own.

  The Animation window plays animations on the shape, from files or from the host.

  More views can be added, in places the host gives it, such as other windows. They only show: what
  is being built, as it changes, and what is selected, each with its own camera.

  What is folded in the list is kept for each open shape while the workshop is open, and
  selecting something unfolds what it hangs on, so it can be seen.

  What the panels do goes through here, so that everything is shown as it is now. "Live"
  is while something is being changed, and "done" is when it is finished.
*/

import { BUILTINS, Figure, isSide, uuid } from "../../shape-core/src/index.js";
import { Desk } from "./model/desk.js";
import { Draft } from "./model/draft.js";
import { Paints } from "./model/paints.js";
import { Selection } from "./model/selection.js";
import { Session } from "./model/session.js";
import { suggestions } from "./model/words.js";
import { inspectorPanel } from "./panels/inspector.js";
import { keyAction } from "./panels/keys.js";
import { Layout } from "./panels/layout.js";
import { toolbarPanel } from "./panels/toolbar.js";
import { treePanel } from "./panels/tree.js";
import { Gizmo } from "./view/gizmo.js";
import { drawGhost, drawMarkers, drawSelected, markerAt, markersOf } from "./view/markers.js";
import { Mover } from "./view/mover.js";
import { NEW_SIZE, outward, Placer } from "./view/placer.js";
import { rotationOn } from "./view/surface.js";
import { Swatches } from "./view/swatches.js";
import { View } from "./view/view.js";
import { AnimationWindow } from "./windows/animation.js";
import { DecalWindow } from "./windows/decals.js";
import { Materials } from "./windows/materials.js";
import { Poses } from "./windows/poses.js";
import { RulesWindow } from "./windows/rules.js";
import { Shapes } from "./windows/shapes.js";
import { Viewer } from "./windows/viewer.js";

const SAME = [1, 1, 1];
const STILL = [0, 0, 0];

export class Workshop {
  #host;
  #layout;
  #markers = [];
  #windows;
  #viewers = new Set();
  #folds = new WeakMap();

  constructor(element, host) {
    this.#host = host;
    this.#layout = new Layout(element, name => name ? this.view.look(name) : this.view.fit());

    this.session = new Session();
    this.desk = new Desk(this, this.session, host);
    this.paints = new Paints(this);
    this.selection = new Selection();
    this.swatches = new Swatches();
    this.cutIds = new Set();

    this.view = this.#makeView();
    this.gizmo = new Gizmo(this.view);
    this.placer = new Placer(this.session, this.view);
    this.mover = new Mover(this.session, this.selection, this.view, this.gizmo, isDone => this.#moved(isDone));
    this.#windows = this.#makeWindows();

    element.addEventListener("keydown", event => keyAction(this, event));
    this.desk.start();
    this.refreshWords();
  }

  addView(element) {
    const viewer = new Viewer(element, this, () => this.#viewers.delete(viewer));

    this.#viewers.add(viewer);
    viewer.show(this.view.figure);

    return viewer;
  }

  get draft() {
    return this.session.current;
  }

  get usable() {
    const { id } = this.draft;

    return this.session.shapes.filter(shape => shape.id !== id && !shape.contains(id));
  }

  get folded() {
    if (!this.#folds.has(this.draft)) this.#folds.set(this.draft, new Set());

    return this.#folds.get(this.draft);
  }

  toggleFold(id) {
    const { folded } = this;

    if (folded.has(id)) folded.delete(id);
    else folded.add(id);

    this.refresh();
  }

  select(id, event) {
    if (event?.ctrlKey || event?.metaKey) this.selection.toggle(id);
    else this.selection.set(id);

    this.#reveal(id);

    this.draft.end();
    this.refresh();
  }

  pickRow(id, event) {
    if (!this.placer.tool) return this.select(id, event);

    const landing = this.placer.landOn(this.draft.get(id));

    if (landing) this.#place(landing, event.shiftKey);
    else this.say("That cannot be attached there. A joint needs a shape between it and the next one.");
  }

  arm(tool) {
    this.placer.arm(tool);
    this.view.overlay.focus();
    this.refresh();
  }

  stop() {
    const isBusy = Boolean(this.placer.tool) || this.cutIds.size > 0;

    this.placer.stop();
    this.cutIds.clear();

    if (!isBusy) this.selection.set();

    this.refresh();
  }

  setMode(mode) {
    this.gizmo.mode = mode;
    this.refresh();
  }

  edit(action) {
    try {
      this.draft.change(action);
    } catch (error) {
      this.say(error.message);
    }

    this.#changed();
  }

  set(id, changes) {
    this.edit(draft => draft.update(id, changes));
  }

  setShape(changes) {
    this.edit(({ json }) => {
      Object.assign(json, changes);

      for (const [name, content] of Object.entries(json)) if (content === undefined) delete json[name];
    });
  }

  live(id, changes) {
    this.draft.begin();
    this.draft.update(id, changes);
    this.showFigure();
  }

  liveAxis(id, name, axis, number) {
    const usual = name === "size" ? SAME : STILL;
    const values = [...this.draft.get(id).value[name] ?? usual];

    values[axis] = number;
    this.live(id, { [name]: values });
  }

  livePoses(poses) {
    this.draft.begin();
    this.draft.json.poses = poses;
    this.draft.refresh();
  }

  done() {
    this.draft.end();
    this.#changed();
  }

  follow(name) {
    const rules = this.session.book.find(name);

    if (!name) this.setShape({ format: undefined });
    else if (rules) this.setShape({ format: rules.reference });
  }

  useShape(id, use) {
    const { value } = this.draft.get(id);
    const isBuiltin = BUILTINS.has(use);
    const isSameKind = isBuiltin === BUILTINS.has(value.use);
    const size = isBuiltin ? [...NEW_SIZE] : [...SAME];

    this.set(id, isSameKind ? { use, plug: undefined } : { use, size, plug: undefined, paint: undefined });
  }

  seatOn(id, holder) {
    const item = this.draft.get(holder);

    if (!item) return this.attachAt(id, "");
    if (item.kind === "socket") return this.seatAt(id, item.value.name);

    const last = this.draft.get(id).value.at?.split("/").at(-1) ?? "";

    this.seatAt(id, `${holder}/${isSide(last) ? last : "top"}`);
  }

  seatAt(id, at) {
    const { kind, value } = this.draft.get(id);
    const side = at.split("/").at(-1);
    const position = kind === "shape" && isSide(side) && !value.plug ? outward(this.draft.thing(id).shape, side, STILL, value.size) : [...STILL];
    const points = kind !== "shape" && !value.movement?.name && isSide(side) && side !== "center";

    this.edit(draft => draft.seat(id, at, points ? { position, rotation: rotationOn(kind, side) } : { position }));
  }

  attach(id, holder) {
    this.attachAt(id, this.#centerOf(holder));
  }

  attachAt(id, at) {
    if (!this.draft.canAttach(id, at)) {
      this.say("That cannot be attached there.");
      this.refresh();

      return;
    }

    this.edit(draft => draft.attach(id, at));
  }

  duplicate() {
    this.#withCopies(draft => draft.duplicate(this.selection.ids));
  }

  mirror() {
    this.#withCopies(draft => draft.mirror(this.selection.ids));
  }

  remove() {
    if (this.selection.first) this.edit(draft => draft.remove(this.selection.ids));
  }

  cut() {
    this.cutIds = new Set(this.selection.ids);
    this.refresh();
  }

  paste() {
    const holder = this.selection.first;
    const ids = [...this.cutIds].filter(id => id !== holder);

    this.cutIds.clear();

    if (!ids.length) return this.refresh();

    this.edit(draft => {
      for (const id of draft.roots(ids)) draft.attach(id, this.#centerOf(holder));
    });
  }

  group() {
    const { ids } = this.selection;
    const items = ids.map(id => this.draft.get(id));
    const first = items.find(({ kind }) => kind === "shape");

    if (!first) return this.say("Select a shape to make one of it.");

    const name = first.value.name || "Part";
    const others = ids.filter(id => id !== first.id);

    this.edit(draft => {
      const made = draft.group([first.id, ...others], name);

      this.session.keep(made.draft);
      this.selection.set(made.id);
    });

    this.say(`${name} is a shape now. Double-click it to edit it, or place it again from Shapes.`);
  }

  makeOwn(id) {
    const { use } = this.draft.get(id).value;
    const { json } = this.session.draftOf(use);

    this.edit(draft => {
      const copy = new Draft(this.session.library, { ...json, id: uuid(), revision: 1, name: `${json.name} copy` });

      this.session.keep(copy);
      draft.update(id, { use: copy.id, revision: undefined });
    });
  }

  undo() {
    this.draft.undo();
    this.#changed();
  }

  redo() {
    this.draft.redo();
    this.#changed();
  }

  openWindow(name) {
    this.#windows[name].open();
  }

  async showAnimation(id) {
    await this.#windows.animation.open();

    if (id) this.#windows.animation.show(id);
  }

  openMaterials(name) {
    this.#windows.materials.choose(this.paints.has(name) ? name : "primary");
  }

  say(text) {
    this.#layout.say(text);
  }

  async exportFile(name, data, type) {
    if (this.#host.exportFile) return this.#host.exportFile(name, data);

    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = Object.assign(document.createElement("a"), { href: url, download: name });

    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return name;
  }

  showFigure() {
    this.selection.keep(this.draft);
    this.#markers = markersOf(this.draft);
    this.view.show(new Figure(this.draft.shape, this.paints.surroundings, false));

    for (const viewer of this.#viewers) viewer.show(this.view.figure);
  }

  switched() {
    this.placer.stop();
    this.cutIds.clear();
    this.selection.set();
    this.showFigure();
    this.view.fit();
    this.refresh();
  }

  refreshWords() {
    this.#layout.suggest(suggestions(this.session.book));
    this.refresh();
  }

  refresh() {
    this.#layout.show({ toolbar: toolbarPanel(this), tree: treePanel(this), inspector: inspectorPanel(this) });

    for (const one of Object.values(this.#windows)) one.refresh();

    this.view.draw();

    for (const viewer of this.#viewers) viewer.refresh();

    this.#host.changed?.(this.desk.unsaved.length + this.desk.unsavedAnimations.length > 0, this.draft.name);
  }

  #makeView() {
    return new View(this.#layout.viewport, {
      grab: (at, event) => this.placer.tool ? null : this.mover.grab(at, event),
      click: (at, event) => this.#clicked(at, event),
      hover: at => this.#hovered(at),
      leave: () => this.#left(),
      open: at => this.#opened(at),
      draw: context => this.#drawOver(context)
    });
  }

  #makeWindows() {
    const parent = this.#layout.windows;

    return {
      decals: new DecalWindow(parent, this),
      materials: new Materials(parent, this),
      shapes: new Shapes(parent, this),
      poses: new Poses(parent, this),
      animation: new AnimationWindow(parent, this, this.#host),
      rules: new RulesWindow(parent, this)
    };
  }

  #centerOf(holder) {
    const item = this.draft.get(holder);

    if (item?.kind === "socket") return item.value.name;

    return item?.kind === "shape" ? `${holder}/center` : "";
  }

  #withCopies(copy) {
    if (!this.selection.first) return;

    this.edit(draft => this.selection.set(...copy(draft)));
    this.#reveal(this.selection.first);
    this.refresh();
  }

  #reveal(id) {
    const { folded, draft } = this;

    for (let holder = id && draft.holderOf(id); holder; holder = draft.holderOf(holder)) folded.delete(holder);
  }

  #place(landing, isMore) {
    this.edit(() => this.selection.set(this.placer.place(landing)));
    this.#reveal(this.selection.first);

    if (!isMore) this.placer.stop();

    this.refresh();
  }

  #changed() {
    this.showFigure();
    this.refresh();
  }

  #moved(isDone) {
    this.showFigure();

    for (const viewer of this.#viewers) viewer.draw();

    if (isDone) this.refresh();
    else this.#layout.syncNumbers(this.draft.get(this.selection.first)?.value ?? {});
  }

  #clicked(at, event) {
    if (!this.placer.tool) {
      const marked = markerAt(this.view, this.#markers, at);

      return this.select(marked?.id ?? this.view.pick(at)?.path[0] ?? null, event);
    }

    this.placer.hover(at);

    if (this.placer.landing) this.#place(this.placer.landing, event.shiftKey);
  }

  #hovered(at) {
    if (!this.placer.tool) return;

    this.placer.hover(at);
    this.view.draw();
  }

  #left() {
    if (!this.placer.tool) return;

    this.placer.leave();
    this.view.draw();
  }

  #opened(at) {
    const id = this.placer.tool ? null : this.view.pick(at)?.path[0];

    if (id) this.desk.enter(id);
  }

  #drawOver(context) {
    if (!this.view.figure) return;

    drawSelected(context, this.view, this.draft, this.selection);
    drawMarkers(context, this.view, this.draft, this.#markers, this.selection);

    const { ghost } = this.placer;

    if (ghost) drawGhost(context, this.view, ghost);

    const target = this.placer.tool ? null : this.mover.target;

    if (target) this.gizmo.draw(context, target);
  }
}
