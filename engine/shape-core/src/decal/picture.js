/*
  A decal collection travels in a 512 square PNG, in its own block and hidden dots.
  The cover lists every drawing, proportionally fitted, with its name.
*/

import { Decals } from "./decals.js";
import { exportSvg } from "./svg.js";
import { Png } from "../picture/png.js";
import { Dots } from "../picture/dots.js";
import { hide, reveal } from "../picture/hiding.js";
import { squeeze, unsqueeze } from "../picture/squeeze.js";

export async function decalCanvas(decal, colors = {}, values = {}, width = 256, height = 256) {
  const image = new Image();
  const source = decal.image || URL.createObjectURL(new Blob([exportSvg(decal, colors, { number: "00", ...values })], { type: "image/svg+xml" }));

  try {
    if (decal.image && /^https?:/i.test(source)) image.crossOrigin = "anonymous";
    image.src = source;
    await image.decode();

    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    const [, , w, h] = decal.image ? [0, 0, image.naturalWidth, image.naturalHeight] : decal.viewBox;
    const fit = Math.min(width / w, height / h);

    if (decal.fit === "stretch") context.drawImage(image, 0, 0, width, height);
    else context.drawImage(image, (width - w * fit) / 2, (height - h * fit) / 2, w * fit, h * fit);

    if (decal.image && decal.recolor) {
      context.globalCompositeOperation = "source-in";
      context.fillStyle = decal.color || "#ffffff";
      context.fillRect(0, 0, width, height);
    }

    return canvas;
  } finally {
    if (!decal.image) URL.revokeObjectURL(source);
  }
}

export class DecalPicture {
  constructor(collection) {
    this.collection = collection instanceof Decals ? collection : new Decals(collection);
    this.hidden = false;
  }

  async bytes() {
    const canvas = Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
    const context = canvas.getContext("2d");
    const entries = this.collection.decals;
    const columns = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
    const rows = Math.max(1, Math.ceil(entries.length / columns));
    const width = 512 / columns;
    const height = 512 / rows;

    context.fillStyle = "#24282e";
    context.fillRect(0, 0, 512, 512);

    for (const [index, entry] of entries.entries()) {
      const x = index % columns * width;
      const y = Math.floor(index / columns) * height;
      const picture = await decalCanvas(entry, {}, {}, Math.max(1, Math.floor(width - 8)), Math.max(1, Math.floor(height * 0.75)));

      context.drawImage(picture, x + 4, y + 4);
      context.fillStyle = "#ffffff";
      context.font = `${Math.max(6, Math.min(14, height * 0.15))}px sans-serif`;
      context.fillText(entry.name, x + 4, y + height - 5, width - 8);
    }

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const cover = Png.read(new Uint8Array(await blob.arrayBuffer()));
    const data = await squeeze(new TextEncoder().encode(JSON.stringify(this.collection)));
    const dots = await Dots.of(cover);

    this.hidden = dots ? hide(dots, data) : false;

    const png = this.hidden ? await dots.into(cover) : cover;

    png.set("deCa", data);

    return png.bytes;
  }

  static async read(bytes) {
    const png = Png.read(bytes);
    const dots = await Dots.of(png);
    let data;

    try { data = png.get("deCa"); } catch { data = null; }

    data ??= dots ? reveal(dots) : null;

    if (!data) return null;

    return new DecalPicture(new Decals(JSON.parse(new TextDecoder().decode(await unsqueeze(data)))));
  }
}
