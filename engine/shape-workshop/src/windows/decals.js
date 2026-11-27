/*
  The decal editor imports SVG, JSON collections and portable PNG collections.
  Drawings are edited as checked SVG items, then applied to selected decal places.
  Applied artwork belongs to the shape and participates in its undo and saving.
*/

import { Decals, DecalPicture, decalCanvas, exportSvg, importSvg, uuid } from "../../../shape-core/src/index.js";
import { button, el, field, note, textField } from "../panels/ui.js";
import { Floating } from "./floating.js";

export class DecalWindow extends Floating {
  #workshop;
  #collection = new Decals({ author: { ai: 1 }, decals: [] });
  #chosen = 0;
  #item = "0";

  constructor(parent, workshop) {
    super(parent, { title: "Decals", width: 440, className: "decals" });

    this.#workshop = workshop;
  }

  content() {
    const entry = this.#collection.decals[this.#chosen];
    const selected = this.#workshop.draft?.get(this.#workshop.selection.first);
    const input = el("input", { type: "file", accept: ".svg,.json,.png", on: { change: event => this.#run(() => this.#open(event.target.files[0])) } });
    const preview = el("canvas", { width: 240, height: 160, style: "background:#34383e;max-width:100%" });

    if (entry) decalCanvas(entry, {}, {}, 240, 160).then(canvas => preview.getContext("2d").drawImage(canvas, 0, 0)).catch(error => this.#workshop.say(error.message));

    return [
      field("Import SVG, decal JSON or PNG", input),
      textField("Collection name", this.#collection.name, { done: name => { this.#collection.name = name; this.refresh(); } }),
      el("div", { className: "buttons" },
        button("New decal", () => {
          this.#collection.decals.push({ id: uuid(), name: "New decal", description: "", author: { ai: 1 }, viewBox: [0, 0, 100, 100], svg: [{ tag: "text", x: 50, y: 70, "text-anchor": "middle", "font-size": 70, fill: "paint:accent", text: "{number}" }] });
          this.#chosen = this.#collection.decals.length - 1;
          this.refresh();
        }),
        button("Save JSON", () => this.#run(() => this.#save("json"))),
        button("Save PNG", () => this.#run(() => this.#save("png")))),
      field("Drawing", el("select", { on: { change: event => { this.#chosen = Number(event.target.value); this.refresh(); } } },
        ...this.#collection.decals.map((one, index) => el("option", { value: index, selected: index === this.#chosen, textContent: one.name })))),
      ...entry ? [
        preview,
        textField("Name", entry.name, { done: name => this.#change({ name }) }),
        textField("Description", entry.description, { done: description => this.#change({ description }) }),
        textField("ViewBox (x y width height)", entry.viewBox.join(" "), { done: value => this.#run(() => this.#change({ viewBox: value.trim().split(/[\s,]+/).map(Number) })) }),
        ...this.#itemFields(entry),
        el("details", {}, el("summary", { textContent: "Drawing JSON" }), field("Drawing items", el("textarea", { value: JSON.stringify(entry.svg, null, 2), rows: 12, style: "width:100%;font-family:monospace", on: { change: event => this.#run(() => this.#change({ svg: JSON.parse(event.target.value) })) } }))),
        note('Use "paint:primary", "paint:secondary", "paint:accent", "paint:metal" or "paint:lights" for fills and strokes. Text can contain {number} or another named value.'),
        el("div", { className: "buttons" },
          button("Export SVG", () => this.#run(() => this.#save("svg"))),
          button("Apply to selected place", () => this.#workshop.set(selected.id, { art: structuredClone(entry) }), { disabled: selected?.kind !== "decals" }),
          button("Use selected artwork", () => {
            this.#collection.decals.push(structuredClone(selected.value.art));
            this.#chosen = this.#collection.decals.length - 1;
            this.refresh();
          }, { disabled: !selected?.value.art }))
      ] : [note("Import a drawing or create a decal. Add a decal place to the shape, select it, then apply the artwork.")]
    ];
  }

  #itemFields(entry) {
    const items = [];
    const visit = (list, parent = "") => list.forEach((item, index) => {
      const path = parent ? `${parent}.${index}` : String(index);

      items.push({ path, item });
      visit(item.children ?? [], path);
    });

    visit(entry.svg);

    const current = items.find(one => one.path === this.#item) ?? items[0];
    const defaults = {
      path: { d: "M10 10H90V90H10Z" }, rect: { x: 10, y: 10, width: 80, height: 80 },
      circle: { cx: 50, cy: 50, r: 40 }, ellipse: { cx: 50, cy: 50, rx: 40, ry: 20 },
      polygon: { points: "50,5 95,95 5,95" }, polyline: { points: "10,10 90,90", fill: "none", stroke: "paint:accent" },
      line: { x1: 10, y1: 10, x2: 90, y2: 90, stroke: "paint:accent" },
      text: { x: 10, y: 60, "font-size": 30, text: "Text" }, g: { children: [] }
    };
    const type = el("select", {}, ...Object.keys(defaults).map(tag => el("option", { value: tag, textContent: tag })));
    const controls = [
      field("Drawing item", el("select", { on: { change: event => { this.#item = event.target.value; this.refresh(); } } }, ...items.map(one => el("option", { value: one.path, selected: one === current, textContent: `${one.path}: ${one.item.tag}` })))),
      el("div", { className: "buttons" }, type, button("Add item", () => {
        this.#item = String(entry.svg.length);
        this.#change({ svg: [...entry.svg, { tag: type.value, fill: "paint:accent", ...defaults[type.value] }] });
      }))
    ];

    if (!current) return controls;

    const names = new Set([...Object.keys(defaults[current.item.tag] ?? {}), "fill", "stroke", "stroke-width", "opacity", "transform", ...Object.keys(current.item)]);
    const change = (name, value) => {
      const svg = structuredClone(entry.svg);
      const indices = current.path.split(".").map(Number);
      let list = svg;

      for (const index of indices.slice(0, -1)) list = list[index].children;

      if (name === "remove") list.splice(indices.at(-1), 1);
      else if (!value) delete list[indices.at(-1)][name];
      else list[indices.at(-1)][name] = value;

      this.#run(() => this.#change({ svg }));
    };

    return [...controls, ...[...names].filter(name => !["tag", "children"].includes(name)).map(name => textField(name, current.item[name] ?? "", { maxLength: 100000, done: value => change(name, value) })), button("Remove item", () => change("remove"))];
  }

  #change(changes) {
    const json = JSON.parse(JSON.stringify(this.#collection));

    Object.assign(json.decals[this.#chosen], changes);
    json.author.ai = 1;
    json.decals[this.#chosen].author.ai = 1;
    this.#collection = new Decals(json);
    this.refresh();
  }

  async #open(file) {
    if (!file) return;

    if (/\.svg$/i.test(file.name)) {
      const { decal, dropped } = importSvg(await file.text(), file.name.replace(/\.svg$/i, ""));

      this.#collection.decals.push(decal);
      this.#chosen = this.#collection.decals.length - 1;
      this.#workshop.say(dropped.length ? `SVG import dropped: ${dropped.join(", ")}` : "SVG imported.");
    } else if (/\.png$/i.test(file.name)) {
      const picture = await DecalPicture.read(new Uint8Array(await file.arrayBuffer()));

      if (!picture) throw new Error("This PNG does not contain decals");

      this.#collection = picture.collection;
      this.#chosen = 0;
    } else {
      this.#collection = new Decals(JSON.parse(await file.text()));
      this.#chosen = 0;
    }

    this.refresh();
  }

  async #save(kind) {
    const entry = this.#collection.decals[this.#chosen];
    const picture = new DecalPicture(this.#collection);
    const data = kind === "png" ? await picture.bytes() : kind === "svg" ? exportSvg(entry) : JSON.stringify(this.#collection, null, 2);
    const name = `${kind === "svg" ? entry.name : this.#collection.name}.${kind}`;
    const type = kind === "png" ? "image/png" : kind === "svg" ? "image/svg+xml" : "application/json";
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const saved = await this.#workshop.exportFile(name, bytes, type);

    if (!saved) return;

    if (kind === "png" && !picture.hidden) this.#workshop.say("Saved in the PNG block; this collection is too large to also fit in its pixels.");
  }

  async #run(action) {
    try {
      await action();
    } catch (error) {
      this.#workshop.say(error.message);
    }
  }
}
