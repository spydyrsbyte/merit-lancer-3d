/*
  The token picture of a mech: the mech as its camera sees it, inside a ring, so it
  looks like a token for whoever does not draw mechs in 3D. Outside of the ring it is
  clear.

  How it looks is the image of the mech item (see items/types.js):
    ring        the style of the ring, one of RINGS
    color       of the ring
    background  inside of the ring, or nothing for clear
    heading     how the mech is turned, as the camera of a token: 0 faces up
    tilt        0 looks straight down, 90 from the side
    zoom        how much larger than just fitting inside of the ring

  The mech stands in the pose of its shape. It is drawn by the renderer which draws the
  mechs on the canvas, so it costs no other WebGL canvas.
*/

import { Camera, Figure } from "../../engine/shape-core/src/index.js";
import { sharedRenderer } from "../canvas/token-picture.js";

export const RINGS = ["plain", "double", "notched", "segmented", "bevel", "none"];
export const USUAL = { ring: "plain", color: "#c8d0d8", background: "", heading: 150, tilt: 40, zoom: 1 };

const SIZE = 512;
const EDGE = 0.04;
const WIDTH = 0.055;
const SEGMENTS = 16;
const NOTCHES = 4;
const NOTCH = 0.16;

export function imageOf(mech) {
  return { ...USUAL, ...mech?.system.mechdata.image };
}

export function drawToken(shape, image, size = SIZE, into = null) {
  const settings = { ...USUAL, ...image };
  const canvas = into ?? document.createElement("canvas");
  const outer = size / 2 * (1 - EDGE);
  const inner = settings.ring === "none" ? outer : outer - size * WIDTH;

  Object.assign(canvas, { width: size, height: size });

  const context = canvas.getContext("2d");

  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath();
  context.arc(size / 2, size / 2, inner, 0, Math.PI * 2);
  context.clip();

  if (settings.background) {
    context.fillStyle = settings.background;
    context.fillRect(0, 0, size, size);
  }

  context.drawImage(mechPicture(shape, settings, size, inner), 0, 0);
  context.restore();
  drawRing(context, settings, size, outer, inner);

  return canvas;
}

export async function tokenBytes(shape, image, size = SIZE) {
  const canvas = drawToken(shape, image, size);
  const blob = await new Promise(done => canvas.toBlob(done, "image/png"));

  return new Uint8Array(await blob.arrayBuffer());
}

function mechPicture(shape, { heading, tilt, zoom }, size, inner) {
  const { canvas, renderer } = sharedRenderer();
  const figure = new Figure(shape);
  const camera = new Camera(heading, tilt);

  figure.land();
  camera.fit(figure.bounds);

  const room = size / (2 * inner) / zoom;

  camera.extent = camera.extent.map(half => half * room);

  if (canvas.width !== size || canvas.height !== size) Object.assign(canvas, { width: size, height: size });

  renderer.clear();
  renderer.draw(figure, camera);

  return canvas;
}

function drawRing(context, { ring, color }, size, outer, inner) {
  if (ring === "none") return;

  const middle = size / 2;
  const radius = (outer + inner) / 2;
  const width = outer - inner;

  context.strokeStyle = color || USUAL.color;
  context.lineWidth = width;

  if (ring === "plain") return circle(context, middle, radius);

  if (ring === "double") {
    context.lineWidth = width * 0.35;
    circle(context, middle, outer - context.lineWidth / 2);
    circle(context, middle, inner + context.lineWidth / 2);

    return;
  }

  if (ring === "segmented") {
    const step = Math.PI * 2 / SEGMENTS;

    for (let one = 0; one < SEGMENTS; one++) arc(context, middle, radius, one * step + step * 0.12, (one + 1) * step - step * 0.12);

    return;
  }

  if (ring === "notched") {
    const step = Math.PI * 2 / NOTCHES;
    const gap = step * NOTCH / 2;

    for (let one = 0; one < NOTCHES; one++) arc(context, middle, radius, one * step + gap - Math.PI / 2, (one + 1) * step - gap - Math.PI / 2);

    return;
  }

  const shine = context.createRadialGradient(middle, middle, inner, middle, middle, outer);

  shine.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  shine.addColorStop(0.45, "rgba(0, 0, 0, 0)");
  shine.addColorStop(0.75, "rgba(255, 255, 255, 0.35)");
  shine.addColorStop(1, "rgba(0, 0, 0, 0.4)");

  circle(context, middle, radius);
  context.strokeStyle = shine;
  circle(context, middle, radius);
}

function circle(context, middle, radius) {
  arc(context, middle, radius, 0, Math.PI * 2);
}

function arc(context, middle, radius, from, to) {
  context.beginPath();
  context.arc(middle, middle, radius, from, to);
  context.stroke();
}
