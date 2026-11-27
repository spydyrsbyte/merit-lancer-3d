/*
  The View draws a figure and turns what the pointer does into points and rays. It is
  three canvases: the ground, the figure, and the lines which are drawn over it.

    drag        turns the view
    right drag  slides it, and so does the middle button
    wheel       comes closer to what is under the pointer

  What a click means, and which drags are something else, is up to whoever uses it. A
  drag which is something else is an object with "move" and "end".

  It can be in another window than the workshop. Then it draws in time with that one.

  Others are figures drawn along with the figure, such as what an animation spawned.

  The ground under the pointer is where the ray meets height zero. Seen from the side
  it never does, so then it is as far away as the middle of the figure.
*/

import { Camera, dot, Renderer, subtract } from "../../../shape-core/src/index.js";
import { drawGround } from "./ground.js";
import { forget, pick } from "./picker.js";

export const VIEWS = {
  angled: { label: "Angled", heading: 155, tilt: 55 },
  front: { label: "Front", heading: 180, tilt: 90 },
  side: { label: "Side", heading: -90, tilt: 90 },
  back: { label: "Back", heading: 0, tilt: 90 },
  top: { label: "Top", heading: 0, tilt: 0 }
};

const ROOM = 1.5;
const EMPTY_SIZE = 60;
const SMALLEST_SIZE = 4;
const FAR = 6000;
const CLICK = 4;
const STEEP = 0.12;
const TURNING = 0.4;
const ZOOM_SPEED = 0.001;
const ZOOM_LIMITS = [1, 2500];

export class View {
  #ground;
  #picture;
  #overlay;
  #renderer;
  #observer;
  #camera = new Camera(VIEWS.angled.heading, VIEWS.angled.tilt);
  #meshes = new Set();
  #drag = null;
  #request = null;
  #home;

  constructor(element, actions) {
    this.#home = element.ownerDocument.defaultView;

    const canvases = ["ground", "picture", "overlay"].map(name => {
      const canvas = this.#home.document.createElement("canvas");

      canvas.className = name;

      return canvas;
    });

    [this.#ground, this.#picture, this.#overlay] = canvases;

    this.element = element;
    this.actions = actions;
    this.figure = null;
    this.others = [];

    element.prepend(...canvases);
    this.#overlay.tabIndex = 0;
    this.#renderer = Renderer.on(this.#picture);
    this.#renderer.decals.changed = () => this.draw();
    this.#listen();
  }

  get overlay() {
    return this.#overlay;
  }

  get ratio() {
    return this.#home.devicePixelRatio || 1;
  }

  get unit() {
    return this.#overlay.width / 2 / this.#camera.extent[0];
  }

  get toward() {
    const { view } = this.#camera;

    return [-view[2], -view[5], -view[8]];
  }

  show(figure) {
    if (this.figure) this.#renderer.stock.dropFigure(this.figure);

    const meshes = new Set(figure?.pieces.map(piece => piece.mesh));

    for (const mesh of this.#meshes) {
      if (!meshes.has(mesh)) this.#renderer.stock.dropMesh(mesh);
    }

    this.#meshes = meshes;
    this.figure = figure;
    this.draw();
  }

  moved() {
    forget(this.figure);
    this.draw();
  }

  look(name) {
    const { heading, tilt } = VIEWS[name];

    Object.assign(this.#camera, { heading, tilt });
    this.fit();
  }

  fit() {
    this.#resize();

    const bounds = this.figure?.bounds;
    const isEmpty = !bounds || bounds.empty;
    const size = isEmpty ? EMPTY_SIZE : Math.max(Math.hypot(...bounds.half) * 2, SMALLEST_SIZE);

    this.#camera.center = this.#onScreen(isEmpty ? [0, 0, 0] : bounds.middle);
    this.#zoom(size * ROOM / 2);
    this.draw();
  }

  draw() {
    this.#request ??= this.#home.requestAnimationFrame(() => {
      this.#request = null;
      this.#paint();
    });
  }

  close() {
    this.#home.cancelAnimationFrame(this.#request);
    this.#request = 0;
    this.#observer.disconnect();
    this.#renderer.close();
  }

  pick(at) {
    return this.figure ? pick(this.figure, this.ray(at)) : null;
  }

  project(point) {
    const { center, extent } = this.#camera;
    const { width, height } = this.#overlay;
    const [across, up] = this.#onScreen(point);

    return [
      ((across - center[0]) / extent[0] + 1) / 2 * width,
      (1 - (up - center[1]) / extent[1]) / 2 * height
    ];
  }

  ray([x, y]) {
    const { view, center, extent } = this.#camera;
    const { width, height } = this.#overlay;
    const across = (x / width * 2 - 1) * extent[0] + center[0];
    const up = (1 - y / height * 2) * extent[1] + center[1];

    const from = [0, 1, 2].map(axis => {
      const [right, above, near] = [view[axis * 3], view[axis * 3 + 1], view[axis * 3 + 2]];

      return right * across + above * up + near * FAR;
    });

    return { from, toward: this.toward };
  }

  ground(at, height = 0) {
    const isSteep = Math.abs(this.toward[2]) > STEEP;

    return isSteep ? this.plane(at, [0, 0, height], [0, 0, 1]) : this.plane(at, this.#focus(), this.toward);
  }

  plane(at, point, normal) {
    const { from, toward } = this.ray(at);
    const distance = dot(subtract(point, from), normal) / dot(toward, normal);

    return from.map((number, axis) => number + toward[axis] * distance);
  }

  #paint() {
    this.#resize();
    this.#camera.depth = FAR;

    const below = this.#ground.getContext("2d");
    const above = this.#overlay.getContext("2d");

    below.clearRect(0, 0, this.#ground.width, this.#ground.height);
    above.clearRect(0, 0, this.#overlay.width, this.#overlay.height);
    this.#renderer.clear();

    drawGround(below, this);

    if (this.figure) this.#renderer.draw(this.figure, this.#camera);

    for (const other of this.others) this.#renderer.draw(other, this.#camera);

    this.actions.draw?.(above, this);
  }

  #onScreen([x, y, z]) {
    const { view } = this.#camera;

    return [view[0] * x + view[3] * y + view[6] * z, view[1] * x + view[4] * y + view[7] * z];
  }

  #focus() {
    const bounds = this.figure?.bounds;

    return !bounds || bounds.empty ? [0, 0, 0] : bounds.middle;
  }

  #zoom(half) {
    const { width, height } = this.#overlay;
    const shape = width / height || 1;
    const kept = Math.max(ZOOM_LIMITS[0], Math.min(ZOOM_LIMITS[1], half));

    this.#camera.extent = shape > 1 ? [kept * shape, kept] : [kept, kept / shape];
  }

  #resize() {
    const { clientWidth, clientHeight } = this.element;
    const width = Math.max(1, Math.round(clientWidth * this.ratio));
    const height = Math.max(1, Math.round(clientHeight * this.ratio));

    if (this.#picture.width === width && this.#picture.height === height) return;

    const half = Math.min(...this.#camera.extent);

    for (const canvas of [this.#ground, this.#picture, this.#overlay]) Object.assign(canvas, { width, height });

    this.#zoom(half);
  }

  #at(event) {
    const { left, top } = this.#overlay.getBoundingClientRect();

    return [(event.clientX - left) * this.ratio, (event.clientY - top) * this.ratio];
  }

  #listen() {
    const overlay = this.#overlay;

    overlay.addEventListener("pointerdown", event => this.#start(event));
    overlay.addEventListener("pointermove", event => this.#move(event));
    overlay.addEventListener("pointerup", event => this.#stop(event));
    overlay.addEventListener("pointercancel", event => this.#stop(event));
    overlay.addEventListener("pointerleave", () => this.actions.leave?.());
    overlay.addEventListener("dblclick", event => this.actions.open?.(this.#at(event)));
    overlay.addEventListener("contextmenu", event => event.preventDefault());
    overlay.addEventListener("wheel", event => this.#wheel(event), { passive: false });

    this.#observer = new this.#home.ResizeObserver(() => this.draw());
    this.#observer.observe(this.element);
  }

  #start(event) {
    const at = this.#at(event);
    const held = event.button === 0 ? this.actions.grab?.(at, event) ?? null : null;

    this.#overlay.focus();
    this.#overlay.setPointerCapture(event.pointerId);
    this.#drag = { start: at, last: at, held, button: event.button, moved: false };
  }

  #move(event) {
    const at = this.#at(event);
    const drag = this.#drag;

    if (!drag) {
      this.actions.hover?.(at);

      return;
    }

    const far = Math.hypot(at[0] - drag.start[0], at[1] - drag.start[1]);

    drag.moved ||= far > CLICK * this.ratio;

    if (!drag.moved) return;

    if (drag.held) drag.held.move(at, event);
    else if (drag.button === 0) this.#turn(at, drag.last);
    else this.#slide(at, drag.last);

    drag.last = at;
  }

  #stop(event) {
    const drag = this.#drag;

    this.#drag = null;

    if (!drag) return;

    drag.held?.end(drag.moved);

    if (!drag.moved && drag.button === 0 && event.type === "pointerup") this.actions.click?.(this.#at(event), event);
  }

  #turn([x, y], last) {
    const camera = this.#camera;
    const before = this.#onScreen(this.#focus());

    camera.heading += (x - last[0]) * TURNING / this.ratio;
    camera.tilt = Math.max(0, Math.min(180, camera.tilt - (y - last[1]) * TURNING / this.ratio));

    const after = this.#onScreen(this.#focus());

    camera.center = [camera.center[0] + after[0] - before[0], camera.center[1] + after[1] - before[1]];
    this.draw();
  }

  #slide([x, y], last) {
    const { center } = this.#camera;

    this.#camera.center = [center[0] - (x - last[0]) / this.unit, center[1] + (y - last[1]) / this.unit];
    this.draw();
  }

  #wheel(event) {
    event.preventDefault();

    const [x, y] = this.#at(event);
    const { width, height } = this.#overlay;
    const across = x / width * 2 - 1;
    const up = 1 - y / height * 2;
    const camera = this.#camera;
    const before = camera.extent;

    this.#zoom(Math.min(...before) * Math.exp(event.deltaY * ZOOM_SPEED));

    camera.center = [
      camera.center[0] + across * (before[0] - camera.extent[0]),
      camera.center[1] + up * (before[1] - camera.extent[1])
    ];

    this.draw();
  }
}
