/*
  The Cast finds what an animation means in a figure.

  The name of a requirement is the joints which met it, such as the arm with the sword.

  A name which a joint really has is that joint. Otherwise its first word says what
  it is, and its number which one, in the order of the rules: "hip02" is the second
  hip, whatever it is called. Without a number it is all of them.

  Inside of another joint, only what hangs on that is meant, and the order is from
  the closest outward. Without a number it is all of the closest ones. If no joint is
  called that, it is what has that keyword, such as the blade in a hand.
*/

import { Anatomy } from "../../shape-core/src/index.js";

const NUMBERED = /^([a-z]+?)(\d+)$/i;
const FIRST = /^[a-z]+/;

export class Cast {
  #figure;
  #rules;
  #named = new Map();

  constructor(figure, rules, animation, place) {
    const anatomy = new Anatomy(figure.shape, place);

    this.#figure = figure;
    this.#rules = rules;

    for (const requirement of animation.requirements) {
      const pieces = requirement.found(anatomy).map(limb => figure.pieces[limb.index + 1]);

      if (requirement.name) this.#named.set(requirement.name, this.#inOrder(pieces, requirement.component));
    }
  }

  find(name, outer = null) {
    const [, word, digits] = NUMBERED.exec(name) ?? [null, name, ""];
    const named = outer ? null : this.#named.get(name) ?? this.#named.get(word);

    if (named) return digits && !this.#named.has(name) ? pick(named, digits) : named;

    const around = this.#figure.pieces.filter(piece => !outer || outer.some(one => hangsOn(piece, one)));
    const exact = around.filter(piece => piece.name === name);

    if (exact.length) return exact;

    const joints = around.filter(piece => FIRST.exec(piece.name)?.[0] === word);
    const same = joints.length ? joints : around.filter(piece => keywordsOf(piece).includes(word));
    const sorted = outer ? byDepth(same) : this.#inOrder(same, word);

    if (digits) return pick(sorted, digits);

    return outer ? sorted.filter(piece => depthOf(piece) === depthOf(sorted[0])) : sorted;
  }

  socket(name, near) {
    const sockets = this.#figure.sockets.filter(socket => !near || near.some(one => one === socket.piece || hangsOn(socket.piece, one)));

    return sockets.find(socket => [socket.name, socket.path].includes(name)) ?? sockets.find(socket => FIRST.exec(socket.name)?.[0] === name) ?? null;
  }

  #inOrder(pieces, word) {
    const names = this.#rules.ordered([...new Set(pieces.map(piece => piece.name))], word);

    return pieces.toSorted((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
  }
}

function pick(pieces, digits) {
  const number = Number(digits);

  return pieces.slice(number - 1, number);
}

function keywordsOf({ chain, shape }) {
  return [...chain.at(-1)?.keywords ?? [], ...shape.keywords];
}

function hangsOn(piece, other) {
  for (let one = piece.parent; one; one = one.parent) {
    if (one === other) return true;
  }

  return false;
}

function depthOf(piece) {
  let depth = 0;

  for (let one = piece; one; one = one.parent) depth++;

  return depth;
}

function byDepth(pieces) {
  return pieces.toSorted((a, b) => depthOf(a) - depthOf(b));
}
