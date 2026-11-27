/*
  A Loadout is what a token shows: the shape of its mech item, with the shape of each
  of its gear items on a mount. It is one shape, made anew whenever the items change,
  and never kept anywhere but in the token picture.

  A gear item which names its mount goes there, if that is free. The others choose, as
  shape-lancer's build does: the largest weapons first, on a socket which takes their
  size and fits one of their plugs, and of those the one whose word comes first in the
  lists below. Guns prefer the right hand and blades the left. A stand-in which fits
  nowhere so goes on any free mount.

  Its id comes from the actor, so it is the same every time, and so are the ids of its
  placements, which animations and glows can name.

  It has the frame's own animations, so a mech walks the way its frame does.

  How gear sits is its place, as the Mech Designer sets it: its size, how it is turned,
  tilted and rolled on its mount, whether it is flipped, and which colors of the mech its
  own colors are. Gear which is taken off is not on the mech.
*/

import { applyInsignia } from "./decals.js";
import { Shape } from "../../engine/shape-core/src/index.js";
import { sizeFor, STAND_INS } from "../items/catalog.js";

const SIZES = ["Superheavy", "Ship-class", "Heavy", "Main", "Auxiliary", "Integrated"];

const FOR_WEAPONS = ["hand", "mount-shoulder", "mount-cradle", "mount-top-deck", "mount-forearm", "mount-hip", "mount-back"];
const FOR_SMALL_BLADES = ["mount-hip", "mount-forearm", "hand", "mount-shoulder"];
const FOR_SYSTEMS = ["mount-back", "mount-chest", "mount-hip", "mount-forearm", "mount-shoulder", "mount-top-deck", "mount-head"];

const MELEE = "Melee";
const SMALL = "Auxiliary";
const STAND_IN_IDS = new Set(Object.values(STAND_INS));

export class Loadout {
  #library;
  #taken = new Set();
  #sockets = [];

  constructor(library) {
    this.notes = [];
    this.mounts = [];

    this.#library = library;
  }

  async shape(key, name, mech, gear) {
    const frame = await this.#library.load(mech.csgid);

    await applyInsignia(frame, mech.insignia);

    this.#sockets = frame.skeleton.sockets;

    const placements = [{ id: idOf(key, "frame"), use: frame.id, name: frame.name }];
    const ordered = [...gear].sort(bySize);

    for (const one of ordered.filter(gear => !gear.place?.off)) {
      const placement = await this.#place(key, one);

      if (placement) placements.push(placement);
    }

    return Shape.create({ id: idOf(key, "loadout"), name, format: frame.format, shapes: placements, animations: { ...frame.animations } });
  }

  async #place(key, gear) {
    const shape = await this.#library.load(gear.csgid);
    const chosen = this.#sockets.find(open => open.name === gear.at && !this.#taken.has(open));
    const open = chosen ?? this.#choose(gear, shape) ?? this.#anyMount(gear, shape);

    if (!open) {
      this.notes.push(`There is no place for ${gear.name || shape.name}`);

      return null;
    }

    const placement = { id: idOf(key, gear.item), use: shape.id, name: gear.name || shape.name, at: open.name };

    this.#taken.add(open);
    this.mounts.push({ item: gear.item, at: open.name, placement: placement.id });

    return { ...placement, ...fitOf(gear, shape) };
  }

  #choose(gear, shape) {
    const words = wordsFor(gear, shape);
    const free = this.#sockets.filter(open => !this.#taken.has(open) && takes(open.socket, gear, shape));
    const ranked = free.map(open => ({ open, rank: rankOf(open, words, gear) })).filter(({ rank }) => rank >= 0);

    return ranked.sort((a, b) => a.rank - b.rank)[0]?.open ?? null;
  }

  #anyMount(gear, shape) {
    if (!STAND_IN_IDS.has(shape.id)) return null;

    const words = wordsFor(gear, shape);
    const free = this.#sockets.filter(open => !this.#taken.has(open) && fits(open.socket, shape));
    const ranked = free.map(open => ({ open, rank: rankOf(open, words, gear) })).filter(({ rank }) => rank >= 0);

    return ranked.sort((a, b) => a.rank - b.rank)[0]?.open ?? null;
  }
}

function fitOf(gear, shape) {
  const { size = 1, turn = 0, tilt = 0, roll = 0, flip = false, paint = {} } = gear.place ?? {};
  const scale = (STAND_IN_IDS.has(shape.id) ? sizeFor(gear) : 1) * size;
  const fit = {};

  if (scale !== 1) fit.size = [scale, scale, scale];
  if (turn || tilt || roll) fit.rotation = [tilt, roll, turn];
  if (flip) fit.flip = true;
  if (Object.keys(paint).length) fit.paint = { ...paint };

  return fit;
}

export function mountsFor(frame, gear, shape) {
  const isStandIn = STAND_IN_IDS.has(shape.id);

  return frame.skeleton.sockets.filter(open => takes(open.socket, gear, shape) || (isStandIn && fits(open.socket, shape)));
}

export function freeSockets(shape, gear) {
  return shape.skeleton.sockets.filter(open => open.socket.accepts.length && takesAny(open.socket, gear));
}

function wordsFor(gear, shape) {
  if (gear.kind !== "weapon") return FOR_SYSTEMS;
  if (gear.weapon === MELEE && gear.size === SMALL) return FOR_SMALL_BLADES;

  const isHeld = shape.plugs[0]?.fits.includes("hand");

  return isHeld ? FOR_WEAPONS : [...FOR_WEAPONS.slice(1), FOR_WEAPONS[0]];
}

function takes(socket, gear, shape) {
  const wanted = gear.kind === "weapon" ? [gear.size] : [gear.kind];

  return fits(socket, shape) && wanted.some(word => socket.accepts.includes(word));
}

function takesAny(socket, gear) {
  const wanted = gear.kind === "weapon" ? ["hand", "mount"] : ["mount"];

  return wanted.some(word => socket.accepts.includes(word));
}

function fits(socket, shape) {
  return shape.plugs.some(plug => plug.fits.some(word => socket.accepts.includes(word)));
}

function rankOf({ name }, words, gear) {
  const rank = words.findIndex(word => name.includes(word));

  if (rank < 0) return rank;

  const side = gear.weapon === MELEE ? "left" : "right";

  return rank + (name.includes(side) ? 0 : 0.5);
}

function bySize(a, b) {
  const rank = gear => {
    const found = SIZES.indexOf(gear.size);

    return found < 0 ? SIZES.length : found;
  };

  return rank(a) - rank(b);
}

export function idOf(...parts) {
  let first = 0x811c9dc5;
  let second = 0x01000193;

  for (const letter of parts.join("/")) {
    first = Math.imul(first ^ letter.charCodeAt(0), 16777619) >>> 0;
    second = Math.imul(second + letter.charCodeAt(0), 2246822519) >>> 0;
  }

  const hex = [first, second, (first ^ second) >>> 0, Math.imul(first, second) >>> 0].map(number => number.toString(16).padStart(8, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
