/*
  Draws a shape by itself, as the bytes of a PNG. The picture can then be given
  the shape to hold (see picture/picture.js).
*/

import { Figure } from "../figure/figure.js";
import { Camera } from "./camera.js";
import { Renderer } from "./renderer.js";

const HEADING = 150;
const TILT = 40;
const SIZE = 1024;

export async function portrait(shape, size = SIZE) {
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const renderer = Renderer.on(canvas);
  const figure = new Figure(shape);
  const camera = new Camera(HEADING, TILT);

  figure.land();
  camera.fit(figure.bounds);

  await renderer.decals.prepare(figure);

  renderer.clear();
  renderer.draw(figure, camera);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));

  renderer.close();

  return new Uint8Array(await blob.arrayBuffer());
}
