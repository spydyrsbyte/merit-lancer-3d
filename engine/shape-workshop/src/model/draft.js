/*
  A Draft is a shape while it is being built. The JSON is what counts, and the shape
  is made from it again after every change.

  Its items are everything which is placed in it: shapes, sockets, plugs and decals.
  Each has an id. In the file only shapes have one, so those of the others are made up
  here, and are left out when it is written.

  An item is attached to another by its "at": to a side of it, or to a socket. That
  makes a tree, and the subtree of an item is all which goes along when it is moved.

  To seat an item is to put it right on a side or a socket. To attach it is to make it
  go along with something, and it stays where it is.

  To fit an item is to give it the position and rotation with which it ends up at a
  place in the world, whatever it is attached to. That is how it can be attached to
  something else without moving, and how its mirror image is found.

  A change is one step of undo. Dragging is many small changes between begin and end,
  and is one step as well. A change which fails is taken back.

  The rig is how it stands as it was built, not in its pose.

  The surroundings are the standard materials of whatever it was entered from, so that
  the hand of a mech is seen in the colors of the mech. They are not part of it. What it
  came from is remembered, as that may be the file it is saved in.
*/

import { BUILTINS, isSide, Rig, Transform, uuid } from "../../../shape-core/src/index.js";
import { History } from "./history.js";
import { freeName, otherSide } from "./names.js";

const LISTS = { shape: "shapes", socket: "sockets", plug: "plugs", decals: "decals" };
const THINGS = { shape: "parts", socket: "sockets", plug: "plugs", decals: "decals" };
const KINDS = Object.keys(LISTS);
const MIRROR = Transform.sized([-1, 1, 1]);
const STILL = [0, 0, 0];
const APART = 10;
const DIGITS = 1000;

export class Draft {
  #library;
  #history = new History();
  #pending = null;
  #saved;
  #items;

  constructor(library, json, isSaved = false) {
    this.#library = library;
    this.surroundings = {};
    this.cameFrom = null;
    this.json = withIds(structuredClone(json));
    this.refresh();
    this.#saved = isSaved ? this.#state : null;
  }

  get id() {
    return this.json.id;
  }

  get name() {
    return this.json.name;
  }

  get isSaved() {
    return this.#state === this.#saved;
  }

  get canUndo() {
    return this.#history.canUndo || this.#pending !== null;
  }

  get canRedo() {
    return this.#history.canRedo;
  }

  get hasRecipe() {
    return Boolean(this.json.shapes);
  }

  get file() {
    return JSON.parse(JSON.stringify(this.shape));
  }

  get items() {
    this.#items ??= KINDS.flatMap(kind => (this.json[LISTS[kind]] ?? []).map(value => ({ id: value.id, kind, value })));

    return this.#items;
  }

  get tree() {
    const rows = [];
    const seen = new Set();
    const holders = new Map(this.items.map(({ id }) => [id, this.holderOf(id)]));

    const visit = (item, depth) => {
      if (seen.has(item.id)) return;

      seen.add(item.id);
      rows.push({ ...item, depth, holder: holders.get(item.id) });

      for (const other of this.items) {
        if (holders.get(other.id) === item.id) visit(other, depth + 1);
      }
    };

    for (const item of this.items) if (!holders.get(item.id)) visit(item, 0);
    for (const item of this.items) visit(item, 0);

    return rows;
  }

  get missing() {
    const lost = this.shape.parts.filter(placement => placement.shape.builtin && !BUILTINS.has(placement.use));

    return lost.map(({ use }) => use);
  }

  refresh() {
    const before = this.shape ?? this.#library.find(this.id);

    this.#items = null;
    this.shape = this.#library.put(this.#clean());

    if (!this.hasRecipe && before) this.shape.accept(before.mesh);

    this.rig = new Rig(this.shape, false);
  }

  markSaved() {
    this.#saved = this.#state;
  }

  revert() {
    if (this.#saved === null) return;

    this.json = JSON.parse(this.#saved);
    this.#history = new History();
    this.refresh();
  }

  get(id) {
    return this.items.find(item => item.id === id) ?? null;
  }

  thing(id) {
    for (const kind of KINDS) {
      const index = (this.json[LISTS[kind]] ?? []).findIndex(value => value.id === id);

      if (index >= 0) return this.shape[THINGS[kind]][index];
    }

    return null;
  }

  find(id) {
    const thing = this.thing(id);

    return thing ? this.rig.find(thing) : null;
  }

  holderOf(id) {
    const at = this.get(id)?.value.at;

    if (!at) return null;

    const socket = this.items.find(({ kind, value }) => kind === "socket" && value.name === at);

    if (socket) return socket.id;

    const [first] = at.split("/");

    if (this.get(first)) return first;

    const path = this.rig.skeleton.find(at)?.path ?? "";

    return this.get(path.split("/")[0])?.id ?? null;
  }

  children(id) {
    return this.items.filter(item => this.holderOf(item.id) === id).map(item => item.id);
  }

  subtree(...ids) {
    const all = new Set(ids);

    for (const id of all) {
      for (const child of this.children(id)) all.add(child);
    }

    return all;
  }

  roots(ids) {
    return [...ids].filter(id => ![...ids].some(other => other !== id && this.subtree(other).has(id)));
  }

  change(action) {
    this.end();
    this.begin();

    try {
      action(this);
    } catch (error) {
      this.json = JSON.parse(this.#pending);
      this.#pending = null;
      this.refresh();

      throw error;
    }

    this.refresh();
    this.end();
  }

  begin() {
    this.#pending ??= this.#state;
  }

  end() {
    const before = this.#pending;

    this.#pending = null;

    if (before !== null && before !== this.#state) this.#history.push(before);
  }

  undo() {
    this.end();
    this.#restore(this.#history.undo(this.#state));
  }

  redo() {
    this.end();
    this.#restore(this.#history.redo(this.#state));
  }

  add(kind, values) {
    const value = { ...values, id: uuid() };
    const list = LISTS[kind];

    if (kind !== "shape") value.name = freeName(value.name, this.#names(kind));

    this.json[list] = [...this.json[list] ?? [], value];
    this.refresh();

    return value.id;
  }

  update(id, changes) {
    const { kind, value } = this.get(id);

    if (kind === "socket" && "name" in changes) this.#rename(value.name, changes.name);
    if (changes.movement && value.movement?.name) this.#renameJoint(value.movement.name, changes.movement.name);

    Object.assign(value, changes);

    for (const [name, content] of Object.entries(value)) if (content === undefined) delete value[name];

    this.refresh();
  }

  remove(ids) {
    const gone = this.subtree(...ids);

    for (const list of Object.values(LISTS)) {
      if (this.json[list]) this.json[list] = this.json[list].filter(({ id }) => !gone.has(id));
    }

    this.refresh();
  }

  canAttach(id, at) {
    const socket = this.items.find(({ kind, value }) => kind === "socket" && value.name === at);
    const holder = socket?.id ?? at.split("/")[0];

    if (this.subtree(id).has(holder)) return false;

    const open = at ? this.rig.skeleton.find(at) : null;

    if (at && !open) return false;

    return this.get(id).kind === "shape" || !open?.movement;
  }

  attach(id, at) {
    if (!this.canAttach(id, at)) throw new Error("It cannot be attached there");

    const { world } = this.find(id) ?? {};

    this.update(id, { at: at || undefined, plug: undefined });

    if (world) this.fit(id, world);
  }

  seat(id, at, values) {
    if (!this.canAttach(id, at)) throw new Error("It cannot be attached there");

    this.update(id, { at, ...values });
  }

  fit(id, world) {
    const { kind, value } = this.get(id);

    Object.assign(value, { position: [...STILL], rotation: [...STILL] });
    this.refresh();

    const found = this.find(id);

    if (!found) return;

    if (kind === "shape" && found.world.flipped !== world.flipped) {
      value.flip = !value.flip;

      return this.fit(id, world);
    }

    const back = found.ground.inverse;
    const held = back.times(found.world).rigid;
    const stance = back.times(world).rigid.times(held.inverse);

    Object.assign(value, { position: stance.origin.map(tidy), rotation: stance.turn.degrees.map(tidy) });
    this.refresh();
  }

  duplicate(ids) {
    const roots = this.roots(ids);
    const copies = this.#copy(this.subtree(...roots));

    for (const id of roots) {
      const { value } = this.get(copies.get(id));

      value.position = value.position.map((number, axis) => axis ? number : number + APART);

      if (value.name && this.get(id).kind === "shape") value.name = `${value.name} copy`;
    }

    this.refresh();

    return roots.map(id => copies.get(id));
  }

  mirror(ids) {
    const roots = this.roots(ids);
    const order = this.tree.map(({ id }) => id).filter(id => this.subtree(...roots).has(id));
    const worlds = new Map(order.map(id => [id, this.find(id)?.world]));
    const copies = this.#copy(new Set(order), otherSide);

    for (const id of order) {
      const copy = this.get(copies.get(id));

      copy.value.at = this.#otherPlace(copy.value.at, roots.includes(id));
      mirrorValues(copy);
      this.refresh();

      if (worlds.get(id)) this.fit(copy.id, MIRROR.times(worlds.get(id)));
    }

    return roots.map(id => copies.get(id));
  }

  group(ids, name) {
    const roots = this.roots(ids);
    const first = this.get(roots[0]);
    const moved = this.subtree(...roots);
    const worlds = new Map(roots.map(id => [id, this.find(id)?.world]));
    const center = this.#centerOf(first);
    const inside = this.#inside(moved, roots, name);
    const draft = new Draft(this.#library, inside);
    const back = center.inverse;

    for (const id of roots) if (worlds.get(id)) draft.fit(id, back.times(worlds.get(id)));

    draft.#saved = null;

    const { at } = first.value;

    this.remove(roots);

    const id = this.add("shape", { use: draft.id, name, at });

    this.fit(id, center);

    return { id, draft };
  }

  #centerOf({ id, value }) {
    const { ground, world } = this.find(id);
    const onSocket = value.at && !isSide(value.at.split("/").at(-1));

    return onSocket ? ground.rigid : Transform.at(world.origin, ground.turn);
  }

  #inside(moved, roots, name) {
    const { version, format, author, materials } = this.json;
    const take = list => this.json[list]?.filter(({ id }) => moved.has(id)) ?? [];
    const lists = Object.fromEntries(Object.values(LISTS).map(list => [list, structuredClone(take(list))]));

    for (const value of Object.values(lists).flat()) if (roots.includes(value.id)) delete value.at;

    const used = new Set(lists.shapes.flatMap(({ paint }) => Object.values(paint ?? {})));
    const own = Object.entries(materials).filter(([slug]) => used.has(slug));
    const heading = format ? { version, format, author } : { version, author };

    return { ...structuredClone(heading), id: uuid(), revision: 1, name, ...lists, materials: structuredClone(Object.fromEntries(own)) };
  }

  #copy(ids, rename = name => name) {
    const fresh = new Map([...ids].map(id => [id, uuid()]));
    const sockets = new Map();

    for (const id of ids) {
      const { kind, value } = this.get(id);
      const copy = { ...structuredClone(value), id: fresh.get(id) };

      if (kind === "shape") copy.name = rename(copy.name ?? "");
      else copy.name = freeName(rename(copy.name), this.#names(kind));

      if (kind === "socket") sockets.set(value.name, copy.name);

      this.json[LISTS[kind]].push(copy);
    }

    this.refresh();

    for (const id of fresh.values()) {
      const { value } = this.get(id);

      if (!value.at) continue;

      const [first, ...rest] = value.at.split("/");

      if (fresh.has(first)) value.at = [fresh.get(first), ...rest].join("/");
      else if (sockets.has(value.at)) value.at = sockets.get(value.at);
    }

    this.refresh();

    return fresh;
  }

  #otherPlace(at, isRoot) {
    if (!at) return at;

    const words = at.split("/");

    if (!isRoot && !isSide(words.at(-1))) return at;

    const other = [...words.slice(0, -1), otherSide(words.at(-1))].join("/");

    return this.rig.skeleton.find(other) ? other : at;
  }

  #rename(from, to) {
    if (!to || from === to) return;
    if (this.#names("socket").has(to)) throw new Error(`There is already a socket ${to}`);

    for (const { value } of this.items) if (value.at === from) value.at = to;
  }

  #renameJoint(from, to) {
    if (!to || from === to) return;

    const others = this.json.sockets.filter(({ movement }) => movement?.name === from);

    if (others.length > 1) return;

    for (const { joints = {} } of Object.values(this.json.poses ?? {})) {
      if (!joints[from]) continue;

      joints[to] = joints[from];
      delete joints[from];
    }
  }

  #names(kind) {
    return new Set((this.json[LISTS[kind]] ?? []).map(({ name }) => name));
  }

  #restore(state) {
    if (state === null) return;

    this.json = JSON.parse(state);
    this.refresh();
  }

  #clean() {
    const json = structuredClone(this.json);

    for (const kind of KINDS) {
      if (kind === "shape") continue;

      json[LISTS[kind]] = (json[LISTS[kind]] ?? []).map(({ id, ...value }) => value);
    }

    return json;
  }

  get #state() {
    return JSON.stringify(this.json);
  }
}

function withIds(json) {
  json.decals ??= json.insignia ?? [];
  delete json.insignia;
  for (const list of Object.values(LISTS)) {
    for (const value of json[list] ?? []) value.id ??= uuid();
  }

  return json;
}

function mirrorValues({ kind, value }) {
  if (kind === "decals") value.turn = tidy(-(value.turn ?? 0));
  if (kind !== "socket" || !value.movement?.name) return;

  const { name, turn = {}, move = {} } = value.movement;

  value.movement = { name: otherSide(name), turn: mirrored(turn, ["y", "z"]), move: mirrored(move, ["x"]) };
}

function mirrored(ranges, axes) {
  const entries = Object.entries(ranges).map(([axis, range]) => {
    const turns = axes.includes(axis) && Array.isArray(range);

    return [axis, turns ? [tidy(-range[1]), tidy(-range[0])] : range];
  });

  return Object.fromEntries(entries);
}

function tidy(number) {
  return Math.round(number * DIGITS) / DIGITS || 0;
}
