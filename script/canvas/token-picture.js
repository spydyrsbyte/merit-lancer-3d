/*
  A TokenPicture is a mech as one token shows it: an actor of shape-animation which
  plays its animations, seen from above at a slant, drawn into a texture which takes
  the place of the token's art. So lighting, fog of war, hidden tokens and filters work
  as they do for a picture.

  Every mech is drawn by one renderer, on a canvas of its own outside of the page, and
  copied into the texture of its token. Browsers only allow a few WebGL canvases, and
  this needs one whatever the number of tokens.

  The texture is as large as the mech can reach in any pose it is likely to take, so it
  does not change size while it moves. Its ground is where the token is.

  Plays are chained by place: an action asked for with join "post" waits until what
  plays in its place is over, and one with join "pre" makes others wait for it. Any
  other replaces what plays in its place (see shape-animation's actor.js).

  It aims as the old module did (see aiming.js): what carries the weapon turns as far as
  it can, and the whole mech turns the rest, away from where its token faces (turned, in
  degrees). It eases into an aim, and out of it, over AIM_TIME milliseconds.

  An action can be made ready: it plays up to its first mark which is not its end,
  such as "fire" or "hit", and is held there until it is released. So a mech aims while
  the dice are rolled, and shoots when they are.

  The muzzle of a weapon is where it is seen now, from the middle of the token, in
  units of the shape, with down the screen positive. A weapon has one muzzle on each
  side it can be on, such as "muzzle-right", which is inside of its placement.
*/

import { Actor } from "../../engine/shape-animation/src/index.js";
import { Bounds, Camera, Figure, Pose, Renderer } from "../../engine/shape-core/src/index.js";
import { shareAim } from "./aiming.js";

export const TILT = 35;
const ROOM = 1.35;
const SMALLEST = 128;
const LARGEST = 1024;
const END = "end";
const AIM_TIME = 450;
const NO_AIM = { body: 0, pose: new Pose() };
const MUZZLE = "muzzle";

let shared = null;
const withMotion = new WeakSet();

export function sharedRenderer() {
  if (shared) return shared;

  const canvas = document.createElement("canvas");

  shared = { canvas, renderer: Renderer.on(canvas) };

  return shared;
}

export class TokenPicture {
  #camera = new Camera(0, TILT);
  #canvas = document.createElement("canvas");
  #body = null;
  #waiting = new Map();
  #held = new Map();
  #blocked = new Set();
  #carried;
  #aim = { from: NO_AIM, to: NO_AIM, time: AIM_TIME };

  constructor(assembly, actor, figure) {
    this.assembly = assembly;
    this.actor = actor;
    this.figure = figure;
    this.texture = null;
    this.dirty = true;
    this.heading = 0;
    this.turned = 0;
    this.marks = [];

    this.#carried = assembly.shape.parts.filter(placement => placement.at).map(placement => placement.id);
    this.#frame();
  }

  static async of(assembly, motion) {
    const figure = new Figure(assembly.shape);

    if (!withMotion.has(assembly.library)) {
      assembly.library.add(motion.shelf);
      withMotion.add(assembly.library);
    }

    for (const json of motion.files) await assembly.library.animation(json.id);

    const { actor } = await Actor.create(figure, motion.rules, assembly.library, { id: assembly.actor.uuid });

    return new TokenPicture(assembly, actor, figure);
  }

  get worldSize() {
    return this.#camera.extent[0] * 2;
  }

  get anchorY() {
    return 0.5 + this.#camera.center[1] / this.worldSize;
  }

  aim(target) {
    const to = target ? shareAim(this.figure, target) : NO_AIM;

    this.#aim = { from: this.#aimed(), to, time: 0 };
    this.dirty = true;
  }

  get aimedTurn() {
    return this.#aim.to.body;
  }

  #aimed() {
    const { from, to, time } = this.#aim;
    const share = Math.min(1, time / AIM_TIME);

    if (share >= 1) return to;

    const smooth = share * share * (3 - 2 * share);

    return { body: from.body + (to.body - from.body) * smooth, pose: from.pose.toward(to.pose, smooth) };
  }

  #followAim(milliseconds) {
    const isEasing = this.#aim.time < AIM_TIME;

    this.#aim.time += milliseconds;

    const aimed = this.#aimed();

    this.turned = aimed.body;
    this.actor.aim = aimed.pose;

    return isEasing;
  }

  turn(heading, limit = Infinity) {
    const difference = Math.normalizeDegrees(heading - this.heading + 180) - 180;

    if (Math.abs(difference) < 0.01) return;

    this.heading += Math.clamp(difference, -limit, limit);
    this.dirty = true;
  }

  move(milliseconds, distance, isIdle) {
    const walking = distance > 0;

    if (walking) this.#body = this.actor.animate("walk");
    else if (isIdle) this.#body = this.actor.animate("idle", { speedLocked: true });
    else if (this.#body?.state.activity === 1) this.#body.stop();

    const isAiming = this.#followAim(milliseconds) || this.#aim.to !== NO_AIM;
    const isMoving = walking || isIdle || isAiming || this.actor.acting || this.#body?.state.activity === 1;
    const { marks, finished } = this.actor.update(milliseconds, walking ? this.actor.slicesFor(distance) : undefined);

    this.figure.land(0, piece => !this.#carried.some(id => piece.path.includes(id)));
    this.marks.push(...marks);

    for (const { place } of finished) this.#next(place);

    if (isMoving || finished.length) this.dirty = true;
  }

  play(name, { place = "", points = {}, join = "" } = {}) {
    const wanted = { name, place, points, join };

    if (this.#blocked.has(place) || join === "post" && this.actor.isBusy(place)) return this.#wait(wanted);

    return this.#start(wanted);
  }

  ready(name, { place = "", points = {} } = {}) {
    const animation = this.actor.find(name, place);
    const mark = animation?.marks.find(one => one !== END) ?? "";
    const playing = this.actor.animate(name, { place, points, speedLocked: true, pauseOn: mark });

    if (!playing.reason) this.#held.set(place, playing);

    this.dirty = true;

    return playing;
  }

  release(place = "") {
    const held = this.#held.get(place);

    this.#held.delete(place);

    if (!held || held.state.activity === 0) return false;

    held.pauseOn("");
    held.resume();

    return true;
  }

  muzzle(placement) {
    const sockets = this.figure.sockets.filter(socket => socket.name.startsWith(MUZZLE) && socket.path.startsWith(`${placement}/`));

    if (!sockets.length) return null;

    const [x, y, z] = sockets[0].place.origin;

    this.#camera.heading = this.heading;

    const view = this.#camera.view;

    return { x: view[0] * x + view[3] * y + view[6] * z, y: -(view[1] * x + view[4] * y + view[7] * z) };
  }

  stop(place = "") {
    this.#held.delete(place);
    this.#waiting.delete(place);
    this.#blocked.delete(place);
    this.actor.stop(place);
  }

  resize(pixels) {
    const size = Math.clamp(2 ** Math.ceil(Math.log2(Math.max(pixels, 1))), SMALLEST, LARGEST);

    if (this.#canvas.width === size) return;

    this.#canvas.width = size;
    this.#canvas.height = size;
    this.texture?.destroy(true);
    this.texture = PIXI.Texture.from(this.#canvas, { scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.OFF });
    this.dirty = true;
  }

  render() {
    const { canvas, renderer: drawer } = sharedRenderer();
    const { width, height } = this.#canvas;

    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });

    this.#camera.heading = this.heading;
    drawer.clear();

    for (const figure of this.actor.figures) drawer.draw(figure, this.#camera);

    const context = this.#canvas.getContext("2d");

    context.clearRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0);
    this.texture?.baseTexture.update();
    this.dirty = false;
  }

  destroy() {
    this.texture?.destroy(true);
    this.texture = null;
  }

  #start({ name, place, points, join }) {
    const playing = this.actor.animate(name, { place, points, speedLocked: true });

    if (join === "pre" && !playing.reason) this.#blocked.add(place);

    this.dirty = true;

    return playing;
  }

  #wait(wanted) {
    const queue = this.#waiting.get(wanted.place) ?? [];

    queue.push(wanted);
    this.#waiting.set(wanted.place, queue);

    return null;
  }

  #next(place) {
    this.#blocked.delete(place);

    const queue = this.#waiting.get(place);
    const next = queue?.shift();

    if (!queue?.length) this.#waiting.delete(place);
    if (next) this.#start(next);
  }

  #frame() {
    this.figure.land();

    const { low, high } = this.figure.bounds;
    const reach = Math.max(...low.slice(0, 2).map(Math.abs), ...high.slice(0, 2).map(Math.abs)) * ROOM;

    this.#camera.fit(Bounds.around([[-reach, -reach, 0], [reach, reach, high[2] * ROOM]]));
  }
}
