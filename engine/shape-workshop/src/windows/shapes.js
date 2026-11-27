/*
  The shapes which are open, and those inside of them, to place them in the current one.
  More can be opened from files.
*/

import { button, el, heading, iconButton, textField } from "../panels/ui.js";
import { Floating } from "./floating.js";

export class Shapes extends Floating {
  #workshop;
  #search = "";

  constructor(parent, workshop) {
    super(parent, { title: "Shapes", width: 320, height: 420, className: "shapes" });

    this.#workshop = workshop;
  }

  content() {
    const { usable } = this.#workshop;
    const wanted = usable.filter(({ name }) => name.toLowerCase().includes(this.#search.toLowerCase()));

    return [
      heading("Open shapes", el("span", { className: "count", textContent: String(usable.length) })),
      textField("Find", this.#search, { key: "find shapes", done: text => {
        this.#search = text;
        this.refresh();
      } }),
      el("ol", { className: "entries", data: { scroll: "entries" } },
        ...wanted.map(shape => this.#row(shape)),
        wanted.length ? null : el("li", { className: "empty", textContent: "Open a shape to place it in this one." })),
      button("Open shapes from files", () => this.#workshop.desk.addShapes(), { symbol: "open" })
    ];
  }

  #row(shape) {
    const isArmed = this.#workshop.placer.tool?.shape?.id === shape.id;

    return el("li", { className: isArmed ? "current" : "" },
      el("span", { className: "name", textContent: shape.name, title: shape.name }),
      iconButton("plus", "Place it: then click where it goes", () => this.#workshop.arm({ kind: "shape", shape })),
      iconButton("edit", "Edit it", () => this.#workshop.desk.showShape(shape.id)));
  }
}
