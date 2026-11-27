/*
  The materials of the shape. The five standard ones are always there. Until they are
  changed they are the usual ones, and come from whatever the shape is put in.
*/

import { isStandard, PATTERNS } from "../../../shape-core/src/index.js";
import { button, checkField, colorInput, el, field, heading, note, sliderField, textField } from "../panels/ui.js";
import { Floating } from "./floating.js";

const COLOR_COUNTS = { solid: 1, panels: 2, rivets: 2, brushed: 2, camo: 3, stripes: 2, hex: 2, grille: 2 };

export class Materials extends Floating {
  #workshop;
  #name = "primary";

  constructor(parent, workshop) {
    super(parent, { title: "Materials", width: 320, className: "materials" });

    this.#workshop = workshop;
  }

  choose(name) {
    this.#name = name;
    this.open();
  }

  content() {
    const { draft } = this.#workshop;

    if (!draft) return [];

    const all = this.#workshop.paints.materials;

    if (!all.some(([name]) => name === this.#name)) this.#name = "primary";

    const material = all.find(([name]) => name === this.#name)[1];
    const isFixed = isStandard(this.#name);
    const isOwn = Object.hasOwn(draft.json.materials, this.#name);

    return [
      heading("Materials", el("span", { className: "count", textContent: String(all.length) })),
      el("div", { className: "swatches", data: { scroll: "swatches" } }, ...all.map(one => this.#swatch(one))),
      el("div", { className: "buttons" },
        button("New", () => this.#add(material), { symbol: "plus", title: "Add a copy of this material" }),
        isFixed
          ? button("As usual", () => this.#remove(), { symbol: "reset", disabled: !isOwn, title: "Takes it from whatever this shape is put in" })
          : button("Delete", () => this.#remove(), { symbol: "trash", title: "Shapes which have it become Primary" })),
      el("div", { className: "buttons apply" }, ...this.#applyButtons()),
      textField("Name", material.name, { key: "material name", done: name => this.#set({ name: name || material.name }) }),
      field("Pattern", el("div", { className: "patterns" }, ...PATTERNS.map(pattern => this.#pattern(material, pattern)))),
      el("div", { className: "colors" }, ...this.#colors(material)),
      ...material.pattern === "solid" ? [] : this.#patternFields(material),
      checkField("Bright", material.bright, bright => this.#set({ bright }), "Ignores shading, for lights and visors"),
      isFixed && !isOwn ? note("This is the usual one. Changing it makes it belong to this shape.") : null
    ];
  }

  #swatch([name, material]) {
    const isCurrent = name === this.#name;

    return el("button", {
      type: "button", className: `swatch${isCurrent ? " current" : ""}`,
      on: { click: () => this.choose(name) }
    }, el("img", { src: this.#workshop.swatches.of(material), alt: "" }), el("span", { textContent: material.name, title: material.name }));
  }

  #applyButtons() {
    const { selection } = this.#workshop;
    const isEmpty = !selection.first;

    return [
      button("Apply", () => this.#workshop.paints.apply(this.#name, false), { disabled: isEmpty, title: "Give what is selected this material" }),
      button("Apply to all attached", () => this.#workshop.paints.apply(this.#name, true), { disabled: isEmpty, title: "And everything attached to it" })
    ];
  }

  #pattern(material, pattern) {
    const isCurrent = material.pattern === pattern;

    return el("button", {
      type: "button", className: `swatch${isCurrent ? " current" : ""}`,
      on: { click: () => this.#set({ pattern }) }
    }, el("img", { src: this.#workshop.swatches.of({ ...material, pattern }), alt: "" }), el("span", { textContent: pattern }));
  }

  #colors(material) {
    const count = COLOR_COUNTS[material.pattern] ?? 3;

    return material.colors.slice(0, count).map((color, index) => field(`Color ${index + 1}`, colorInput(color, {
      key: `color ${index}`,
      set: value => this.#live({ colors: this.#now.colors.map((old, i) => i === index ? value : old) }),
      done: () => this.#workshop.done()
    })));
  }

  #patternFields(material) {
    return [
      sliderField("Size", material.size, { low: 2, high: 80, set: size => this.#live({ size }), done: () => this.#workshop.done() }),
      sliderField("Bump", material.bump, { low: 0, high: 1, step: 0.05, set: bump => this.#live({ bump }), done: () => this.#workshop.done() })
    ];
  }

  get #now() {
    return this.#workshop.paints.materials.find(([name]) => name === this.#name)[1];
  }

  #live(values) {
    this.#workshop.paints.live(this.#name, { ...plain(this.#now), ...values });
  }

  #set(values) {
    this.#live(values);
    this.#workshop.done();
  }

  #add(material) {
    this.#name = this.#workshop.paints.add(plain(material));
    this.refresh();
  }

  #remove() {
    const name = this.#name;

    if (!isStandard(name)) this.#name = "primary";

    this.#workshop.paints.remove(name);
  }
}

function plain(material) {
  return JSON.parse(JSON.stringify(material));
}
