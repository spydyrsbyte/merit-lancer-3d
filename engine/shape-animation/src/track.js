/*
  A Track is one value over time, such as how far a knee is bent. It fades smoothly
  from each key to the next.

  A pause is a key with whatever value there was. A definition starts with one, so
  its movement starts when it is played, and not when the last one was over.

  In a loop, what comes before the first key is the last one, a loop earlier.
*/

export class Track {
  #keys = [];
  #blend;
  #start;

  constructor(start, blend = (from, to, amount) => from + (to - from) * amount) {
    this.#start = start;
    this.#blend = blend;
  }

  get isEmpty() {
    return !this.#keys.length;
  }

  add(at, value) {
    this.#keys.push({ at, value });
  }

  has(at) {
    return this.#keys.some(key => key.at === at && !key.pause);
  }

  pause(at) {
    this.#keys.push({ at, pause: true });
  }

  at(time, length, loop) {
    const keys = this.#filled(length, loop);
    const next = keys.findIndex(key => key.at > time);

    if (next < 0) return keys.at(-1).value;
    if (next === 0) return keys[0].value;

    const from = keys[next - 1];
    const to = keys[next];
    const amount = (time - from.at) / (to.at - from.at);

    return this.#blend(from.value, to.value, amount * amount * (3 - 2 * amount));
  }

  #filled(length, loop) {
    if (this.isEmpty) return [{ at: 0, value: this.#start }];

    const sorted = this.#keys.toSorted((a, b) => a.at - b.at);
    const real = sorted.filter(key => !key.pause);
    const last = loop && real.length ? real.at(-1).value : this.#start;

    const keys = [{ at: loop && real.length ? real.at(-1).at - length : 0, value: last }];

    for (const key of sorted) keys.push({ at: key.at, value: key.pause ? keys.at(-1).value : key.value });

    if (loop) keys.push({ at: sorted[0].at + length, value: keys[1].value });

    return keys;
  }
}
