/*
  SVG interchange for decals. Import reports unsupported elements and attributes.
  Export resolves named colors and editable text values without accepting markup.
*/

import { DECAL_FIELDS, DECAL_TAGS, cleanItems, viewBox } from "./decals.js";
import { uuid } from "../file/uuid.js";

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function exportSvg(decal, colors = {}, values = {}) {
  const paint = value => String(value).startsWith("paint:") ? colors[String(value).slice(6)] ?? "#ffffff" : value;
  const itemText = item => {
    const attributes = Object.entries(item).filter(([key]) => DECAL_FIELDS.includes(key)).map(([key, value]) => `${key}="${escape(paint(value))}"`).join(" ");
    const text = String(item.text ?? "").replace(/\{([\w-]+)\}/g, (whole, name) => values[name] ?? whole);

    return `<${item.tag} ${attributes}>${escape(text)}${(item.children ?? []).map(itemText).join("")}</${item.tag}>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(decal.viewBox).join(" ")}" preserveAspectRatio="${decal.fit === "stretch" ? "none" : "xMidYMid meet"}">${cleanItems(decal.svg).map(itemText).join("")}</svg>`;
}

export function importSvg(source, name = "Decal") {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");

  if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") throw new Error("This is not a valid SVG drawing");

  const dropped = [];
  const read = element => {
    const tag = element.localName;

    if (!DECAL_TAGS.includes(tag)) {
      dropped.push(`Element: ${tag}`);
      return [];
    }

    const item = { tag };

    for (const attribute of element.attributes) {
      if (!DECAL_FIELDS.includes(attribute.name) || /url\s*\(|[<>]/i.test(attribute.value)) dropped.push(`${tag}: ${attribute.name}`);
      else item[attribute.name] = attribute.value;
    }

    if (tag === "text") item.text = [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join("");
    if (element.children.length) item.children = [...element.children].flatMap(read);

    return [item];
  };
  const root = document.documentElement;
  const svg = [...root.children].flatMap(read);
  const inherited = {};

  for (const attribute of root.attributes) {
    if (["xmlns", "viewBox", "width", "height"].includes(attribute.name)) continue;
    if (attribute.name === "preserveAspectRatio" && ["none", "xMidYMid", "xMidYMid meet"].includes(attribute.value)) continue;
    if (DECAL_FIELDS.includes(attribute.name) && !/url\s*\(|[<>]/i.test(attribute.value)) inherited[attribute.name] = attribute.value;
    else dropped.push(`svg: ${attribute.name}`);
  }

  return { decal: { id: uuid(), name, description: "", author: { ai: 1 }, fit: root.getAttribute("preserveAspectRatio") === "none" ? "stretch" : "contain", viewBox: root.hasAttribute("viewBox") ? viewBox(root.getAttribute("viewBox")) : viewBox([0, 0, Number.parseFloat(root.getAttribute("width")) || 100, Number.parseFloat(root.getAttribute("height")) || 100]), svg: [{ tag: "g", ...inherited, children: svg }] }, dropped };
}
