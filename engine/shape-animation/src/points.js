/*
  The Points of an animation while it plays, in the world.

    points.me              the middle of whoever does it
    points.me.sword        what is in it: the name of a requirement, a joint, a socket,
                           or a keyword
    points.target          what the game fills in: a place, or another actor
    points.target.head     what is in that

  They are measured once, when the animation starts. Those of "me" are kept in
  relation to the shape, and go along when it moves. Others stay where they were.
  With ":now" at the end they are where things are at the moment.

  A place from the game is measured from the shape. What is not there is nothing,
  and whatever uses it is left out.
*/

import { Cast } from "./cast.js";

const NAME = /^points\.([^.:]+)(?:\.([^:]+))?(:now)?$/;
const ME = "me";
const NOBODY = { requirements: [] };

export class Points {
  #figure;
  #rules;
  #cast;
  #sources;
  #origin;
  #kept = new Map();

  constructor(figure, rules, cast, sources, origin) {
    this.#figure = figure;
    this.#rules = rules;
    this.#cast = cast;
    this.#sources = sources;
    this.#origin = origin;
  }

  keep(names) {
    for (const name of names) {
      const match = NAME.exec(name);

      if (match && !match[3]) this.#kept.set(name, this.#measure(match[1], match[2]));
    }
  }

  move(origin) {
    this.#origin = origin;
  }

  find(name) {
    const match = NAME.exec(name);

    if (!match) return null;

    const [, source, inside, now] = match;

    if (now) return this.#world(this.#measure(source, inside));
    if (!this.#kept.has(name)) this.#kept.set(name, this.#measure(source, inside));

    return this.#world(this.#kept.get(name));
  }

  #measure(source, inside) {
    if (source === ME) return this.#local(middleOf(this.#figure, this.#cast, inside));

    const given = this.#sources[source];

    if (!given) return null;
    if (Array.isArray(given)) return { world: this.#origin.point(given) };

    const cast = new Cast(given.figure, this.#rules, NOBODY, "");
    const world = middleOf(given.figure, cast, inside);

    return world ? { world } : null;
  }

  #local(world) {
    if (!world) return null;

    const { origin, turn } = this.#origin;

    return { local: turn.inverse.apply(world.map((number, i) => number - origin[i])) };
  }

  #world(point) {
    if (!point) return null;

    return point.world ?? this.#origin.point(point.local);
  }
}

function middleOf(figure, cast, inside) {
  if (!inside) return figure.bounds.middle;

  const socket = cast.socket(inside);

  if (socket?.name === inside) return socket.place.origin;

  const [piece] = cast.find(inside);

  if (!piece) return socket?.place.origin ?? null;
  if (piece.movement) return piece.world.origin;

  return piece.world.point(piece.mesh.bounds.middle);
}
