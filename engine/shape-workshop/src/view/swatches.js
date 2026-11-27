/*
  The Swatches are small pictures of materials, each on a block. They are all drawn by
  one renderer, as browsers allow only a few.
*/

import { Camera, Figure, Renderer, Shape } from "../../../shape-core/src/index.js";

const PIXELS = 96;
const BLOCK = 40;
const MOST = 600;

export class Swatches {
  #canvas = document.createElement("canvas");
  #renderer;
  #figure;
  #camera = new Camera(150, 45);
  #known = new Map();

  constructor() {
    Object.assign(this.#canvas, { width: PIXELS, height: PIXELS });

    this.#renderer = Renderer.on(this.#canvas);
    this.#figure = new Figure(Shape.create({ shapes: [{ use: "box", size: [BLOCK, BLOCK, BLOCK], position: [0, 0, BLOCK / 2] }] }));
    this.#camera.fit(this.#figure.bounds);
    this.#camera.extent = [BLOCK * 0.9, BLOCK * 0.9];
  }

  of({ name, ...material }) {
    const key = JSON.stringify(material);

    if (!this.#known.has(key)) {
      if (this.#known.size > MOST) this.#known.clear();

      this.#known.set(key, this.#draw(material));
    }

    return this.#known.get(key);
  }

  #draw(material) {
    this.#figure.paint({ primary: material });
    this.#renderer.clear();
    this.#renderer.draw(this.#figure, this.#camera);

    return this.#canvas.toDataURL();
  }
}
