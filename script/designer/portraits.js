/*
  Pictures of library entries for the tiles of the Mech Designer. They are drawn when
  they come into view, one at a time, as drawing all of a large library at once would
  take long. Each is drawn once.

  An image with the id of a shape as data-portrait gets its picture.
*/

import { Library, portrait } from "../../engine/shape-core/src/index.js";
import { Finder } from "../items/finder.js";

const SIZE = 160;
const drawn = new Map();
const queue = [];

let isDrawing = false;

const observer = new IntersectionObserver(entries => {
  for (const { isIntersecting, target } of entries) {
    if (!isIntersecting) continue;

    observer.unobserve(target);
    queue.push(target);
  }

  if (!isDrawing && queue.length) drawNext();
}, { rootMargin: "80px" });

export function drawPortraits(element) {
  for (const image of element.querySelectorAll("img[data-portrait]:not([src])")) {
    const known = drawn.get(image.dataset.portrait);

    if (known) image.src = known;
    else observer.observe(image);
  }
}

async function drawNext() {
  const image = queue.shift();

  if (!image) {
    isDrawing = false;

    return;
  }

  isDrawing = true;

  if (image.isConnected && !image.src) {
    const source = await pictureOf(image.dataset.portrait);

    if (source) image.src = source;
    else image.hidden = true;
  }

  requestAnimationFrame(drawNext);
}

async function pictureOf(id) {
  if (drawn.has(id)) return drawn.get(id);

  const shape = await new Library([new Finder([])]).load(id).catch(() => null);
  const bytes = shape ? await portrait(shape, SIZE).catch(() => null) : null;
  const source = bytes ? URL.createObjectURL(new Blob([bytes], { type: "image/png" })) : "";

  drawn.set(id, source);

  return source;
}
