/*
  The Anatomy of a shape is its joints, what hangs on each, and what is held there.
  It is what the requirements of an animation are checked against.

  A limb here has its joint, if it bends, the limb it hangs on, and the shapes which
  are in it, each as its keywords. A blade which was built into a fist is in there as
  well as one which is held.

  An anatomy can be about one place, a socket or a joint, such as "hand-left". Then
  its center is the joint that place is on, and only what is attached there is held.
  This is how a button for the left hand finds what to do with what is in it.

  Limbs are in the order of the skeleton, which is also that of the pieces of a
  figure, after its body.
*/

import { parseName } from "../file/words.js";

export class Anatomy {
  constructor(shape, place = "") {
    const { limbs, sockets } = shape.skeleton;

    this.limbs = limbs.map((limb, index) => ({
      index,
      joint: limb.movement?.name ?? "",
      parent: limbs.indexOf(limb.parent),
      at: limb.at,
      shapes: shapesIn(limb.chain.at(-1))
    }));

    const socket = sockets.find(open => open.name === place);

    this.place = place;
    this.center = socket ? this.limbs[limbs.indexOf(socket.owner)] : this.limbs.find(limb => limb.joint === place);
  }

  joints(word) {
    return this.limbs.filter(limb => firstWord(limb) === word);
  }

  reach(limb) {
    return this.limbs.filter(other => other === limb || this.#hangsOn(other, limb));
  }

  isAround(limb) {
    if (!this.place) return true;

    return Boolean(this.center) && this.reach(limb).includes(this.center);
  }

  jointsOn(limb, word) {
    return this.reach(limb).filter(other => other !== limb && firstWord(other) === word).length;
  }

  shapesOn(limb, words) {
    const held = this.#held(limb).flatMap(other => other.shapes);

    return held.filter(keywords => words.every(word => keywords.has(word))).length;
  }

  #held(limb) {
    if (!this.place) return this.reach(limb);

    const attached = this.limbs.filter(other => other.at === this.place);

    return attached.flatMap(other => this.reach(other));
  }

  #hangsOn(limb, other) {
    for (let index = limb.parent; index >= 0; index = this.limbs[index].parent) {
      if (index === other.index) return true;
    }

    return false;
  }
}

function firstWord({ joint }) {
  return parseName(joint)?.[0].word ?? "";
}

function shapesIn(placement) {
  const { shape } = placement;
  const own = new Set([...placement.keywords, ...shape.keywords]);

  const inside = shape.skeleton.body.flatMap(entry => shapesIn(entry.placement));

  return [own, ...inside];
}
