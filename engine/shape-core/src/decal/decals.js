/*
  Decals is a portable collection of vector drawings. Each drawing has its own
  viewBox and editable SVG items. Paint names are resolved when it is drawn.
  Only the supported drawing vocabulary is retained; executable SVG is never kept.
*/

import { Heading } from "../file/heading.js";
import { Author } from "../file/author.js";
import { uuid } from "../file/uuid.js";

export const DECAL_TAGS = ["g", "path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "text"];
export const DECAL_FIELDS = ["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "fill", "stroke", "stroke-width", "fill-rule", "opacity", "fill-opacity", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "transform", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline"];

export class Decals extends Heading {
  constructor(json) {
    super(json, "Decals", { major: 1, minor: 0 });

    this.decals = (json.decals ?? []).map(entry => ({
      id: entry.id || uuid(), name: String(entry.name ?? "Decal"),
      description: String(entry.description ?? ""), author: new Author(entry.author ?? json.author),
      viewBox: viewBox(entry.viewBox), fit: entry.fit === "stretch" ? "stretch" : "contain", svg: cleanItems(entry.svg), meta: structuredClone(entry.meta ?? {})
    }));
    this.meta = structuredClone(json.meta ?? {});
  }

  toJSON() {
    return { ...this.heading, decals: this.decals, meta: this.meta };
  }
}

export function viewBox(given = [0, 0, 100, 100]) {
  const values = typeof given === "string" ? given.trim().split(/[\s,]+/).map(Number) : given;

  if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) throw new Error("A decal viewBox needs x, y, positive width and positive height");

  return [...values];
}

export function cleanItems(items = []) {
  return items.map(item => {
    if (!DECAL_TAGS.includes(item.tag)) throw new Error(`Unsupported decal item: ${item.tag}`);

    const attributes = Object.fromEntries(Object.entries(item).filter(([key, value]) => DECAL_FIELDS.includes(key) && ["string", "number"].includes(typeof value)));

    for (const value of Object.values(attributes)) if (/url\s*\(|[<>]/i.test(String(value))) throw new Error("Decal attributes cannot contain links or markup");

    return { tag: item.tag, ...attributes, ...item.tag === "text" ? { text: String(item.text ?? "") } : {}, ...item.children ? { children: cleanItems(item.children) } : {} };
  });
}
