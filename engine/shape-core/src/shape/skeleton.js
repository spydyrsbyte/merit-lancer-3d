/*
  A Skeleton is how the placements and spots of a shape hang together.

  The body is everything which cannot move. It melts into one mesh. A limb is a
  placement on a socket which bends, or on something which is on a limb. It keeps the
  mesh of its own shape, so four legs share one.

  A shape in a shape brings its own limbs and sockets along. If it is in the body,
  they now hang on the body, and otherwise on the limb it became. Each limb has:
    chain     the placements it came through, outermost first
    at        the name of the socket it is on
    parent    the limb it hangs on, or nothing for the body
    stance    where that is on the parent
    fitting   what comes after the bend: its offset, its size, and its plug
    movement  how it bends, if it does
    rest      how it is bent at the start, by the poses of the shapes it is in

  Where something is, is measured from its owner, a limb as it is bent or the body:
    ground     where its own position is measured from
    transform  the place itself, at its size

  A socket is found by its name, or by "id of the placement/name", which is never
  mistaken. Names get the side they are on (see file/words.js). The sides of a shape
  (see socket/sides.js) are only found the second way, and only made when they are
  asked for, as there are so many.

  The order does not matter for where things are. Something is added once what it is on
  is there, and the body is put back in order afterwards, as sides which are in the same
  place are seen in that order. Those which never find what they are on are lost, and placed as if they had no "at". What is on something
  hidden is hidden with it. A cut on a limb is idle.

  A spot cannot be right on a socket which bends, as nothing is there to carry it.
*/

import { which, within } from "../file/words.js";
import { Transform } from "../space/transform.js";
import { isSide, OPPOSITE, sidePoint } from "../socket/sides.js";
import { CENTER_PLUG, Socket } from "../socket/socket.js";

const PLAIN = new Socket({});

export class Skeleton {
  #opens = [];
  #inside = new Map();

  constructor(shape) {
    this.body = [];
    this.cuts = [];
    this.limbs = [];
    this.lost = [];
    this.idle = [];
    this.places = new Map();
    this.decals = [];

    this.#build([...shape.sockets, ...shape.decals, ...shape.plugs], shape.parts);
  }

  get sockets() {
    return this.#opens.filter(open => !open.hidden);
  }

  find(at) {
    const byName = this.#opens.find(open => open.name === at);
    const byPath = this.#opens.find(open => `${open.path}/${open.socket.name}` === at);

    return byName ?? byPath ?? this.#side(at);
  }

  #side(at) {
    const slash = at.lastIndexOf("/");
    const side = at.slice(slash + 1);
    const path = at.slice(0, Math.max(0, slash));
    const found = isSide(side) ? this.#locate(path.split("/")) : null;

    if (!found) return null;

    const { placement, owner, transform, suffix, hidden } = found;
    const { origin, turn } = transform;
    const upright = Transform.at([0, 0, 0], turn);
    const local = upright.inverse.times(new Transform(transform.axes));
    const point = upright.point(sidePoint(side, placement.shape, local));
    const stance = Transform.at(origin.map((number, axis) => number + point[axis]), turn);

    return { socket: PLAIN, side, name: "", path, owner, stance, movement: null, suffix, hidden };
  }

  #locate([id, ...rest]) {
    const found = this.#inside.get(id);

    if (!found || !rest.length) return found ?? null;

    const inner = found.inner instanceof Skeleton ? found.inner.#locate(rest) : null;

    if (!inner) return null;

    const owner = inner.owner ? found.copies.get(inner.owner) : found.owner;
    const transform = inner.owner ? inner.transform : found.transform.times(inner.transform);

    return { ...inner, owner, transform, suffix: inner.suffix || found.suffix, hidden: found.hidden || inner.hidden };
  }

  #build(spots, placements) {
    let waiting = [...spots, ...placements];

    while (waiting.length) {
      const ready = waiting.filter(thing => !thing.at || carries(thing, this.find(thing.at)));

      if (!ready.length) break;

      for (const thing of ready) this.#add(thing, thing.at ? this.find(thing.at) : null);

      waiting = waiting.filter(thing => !ready.includes(thing));
    }

    for (const thing of waiting) {
      this.lost.push(thing);
      this.#add(thing, null);
    }

    const order = new Map(placements.map((placement, index) => [placement, index]));
    const byOrder = (a, b) => order.get(a.placement) - order.get(b.placement);

    this.body.sort(byOrder);
    this.cuts.sort(byOrder);
  }

  #add(thing, open) {
    if (isPlacement(thing)) this.#place(thing, open);
    else this.#mark(thing, open);
  }

  #mark(spot, open) {
    const owner = open?.owner ?? null;
    const ground = open?.stance ?? new Transform();
    const stance = ground.times(spot.stance);
    const suffix = open?.suffix ?? "";
    const hidden = open?.hidden ?? false;

    this.places.set(spot, { owner, ground, transform: stance, hidden });

    if ("art" in spot && !hidden) this.decals.push({ decal: spot, owner, transform: stance });

    if (!(spot instanceof Socket)) return;

    this.#opens.push({ socket: spot, side: "", name: spot.name, path: "", owner, stance, movement: spot.movement, suffix, hidden });
  }

  #place(placement, open) {
    const movement = open?.movement ?? null;
    const owner = open?.owner ?? null;
    const flip = placement.flip !== (open?.socket.flip ?? false);
    const sizing = placement.sizing(flip);

    const stance = open ? open.stance : new Transform();
    const fitting = placement.stance.times(releaseOf(placement, open, sizing)).times(sizing);
    const suffix = movement ? which(movement.name) : open?.suffix ?? "";
    const hidden = placement.hidden || (open?.hidden ?? false);
    const transform = stance.times(fitting);

    if (placement.cut) {
      this.#keep(placement, { owner, ground: stance, transform, suffix, hidden });

      if (hidden) return;
      if (owner || movement) this.idle.push(placement);
      else this.cuts.push({ placement, transform });

      return;
    }

    if (!owner && !movement) {
      if (!hidden) this.body.push({ placement, transform });

      this.#embed(placement, { owner: null, ground: stance, transform, suffix, hidden });

      return;
    }

    const limb = { chain: [placement], at: open.name, parent: owner, stance, fitting, movement, rest: null };

    if (!hidden) this.limbs.push(limb);

    this.#embed(placement, { owner: limb, ground: new Transform(), transform: fitting, suffix, hidden });
  }

  #keep(placement, place, inner = null, copies = new Map()) {
    this.places.set(placement, place);
    this.#inside.set(placement.id, { ...place, placement, inner, copies });
  }

  #embed(placement, place) {
    const { owner, transform, suffix, hidden } = place;
    const { shape } = placement;
    const inner = shape.skeleton;
    const joints = shape.poses[placement.pose || shape.pose]?.joints ?? {};
    const copies = new Map();

    this.#keep(placement, place, inner, copies);

    for (const limb of inner.limbs) {
      const copy = {
        ...limb,
        chain: [placement, ...limb.chain],
        at: within(limb.at, suffix),
        parent: limb.parent ? copies.get(limb.parent) : owner,
        stance: limb.parent ? limb.stance : transform.times(limb.stance),
        movement: limb.movement?.within(suffix) ?? null,
        rest: joints[limb.movement?.name] ?? limb.rest
      };

      copies.set(limb, copy);

      if (!hidden) this.limbs.push(copy);
    }

    for (const mark of inner.decals) {
      if (!hidden) this.decals.push({ ...mark, owner: mark.owner ? copies.get(mark.owner) : owner, transform: mark.owner ? mark.transform : transform.times(mark.transform) });
    }

    for (const open of inner.sockets) {
      this.#opens.push({
        ...open,
        name: within(open.name, suffix),
        path: [placement.id, open.path].filter(Boolean).join("/"),
        owner: open.owner ? copies.get(open.owner) : owner,
        stance: open.owner ? open.stance : transform.times(open.stance),
        suffix: open.suffix || suffix,
        movement: open.movement?.within(suffix) ?? null,
        hidden
      });
    }
  }
}

function isPlacement(thing) {
  return "use" in thing;
}

function carries(thing, open) {
  return Boolean(open) && (isPlacement(thing) || !open.movement);
}

function releaseOf(placement, open, sizing) {
  if (!open) return new Transform();

  const { plugs } = placement.shape;
  const chosen = plugs.find(plug => plug.name === placement.plug);

  if (chosen) return chosen.release(sizing);

  const side = isSide(placement.plug) ? placement.plug : OPPOSITE[open.side];

  if (side) {
    const [x, y, z] = sidePoint(side, placement.shape, sizing);

    return Transform.at([-x, -y, -z]);
  }

  const plug = plugs.find(one => one.fitsIn(open.socket)) ?? plugs[0] ?? CENTER_PLUG;

  return plug.release(sizing);
}
