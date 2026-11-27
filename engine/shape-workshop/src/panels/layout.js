/*
  The Layout of the workshop: where its panels are, what it says, and the words which
  are offered while typing. The list can be made wider by its edge.

  When what had the focus is gone, the workshop itself gets it, so that keys still work.
*/

import { VIEWS } from "../view/view.js";
import { button, el, list, redraw } from "./ui.js";

const HINT = "Drag to orbit · Right-drag to slide · Scroll to zoom · Click to select · Shift+drag to move · Ctrl+drag to raise · Double-click to go inside";
const SHOWN_FOR = 7000;
const DIGITS = 1000;

const NUMBERS = { Position: "position", Rotation: "rotation", Size: "size", "Size (times)": "size" };

export class Layout {
  #element;
  #panels;
  #lists = el("div");
  #message = el("p", { className: "message", attributes: { role: "status" } });
  #timer = null;

  constructor(element, look) {
    this.#element = element;
    this.viewport = el("section", { className: "viewport" });
    this.windows = el("div", { className: "windows" });

    this.#panels = {
      toolbar: el("header", { className: "toolbar" }),
      tree: el("section", { className: "tree" }),
      inspector: el("section", { className: "inspector" })
    };

    const views = Object.entries(VIEWS).map(([name, { label }]) => button(label, () => look(name)));

    this.viewport.append(
      el("div", { className: "views" }, ...views, button("Fit", () => look(""), { title: "F" })),
      this.#message,
      el("p", { className: "hint over", textContent: HINT }),
      this.#divider()
    );

    const { toolbar, tree, inspector } = this.#panels;

    element.classList.add("shape-workshop");
    element.tabIndex = -1;
    element.replaceChildren(toolbar, tree, this.viewport, inspector, this.windows, this.#lists);
  }

  show(panels) {
    for (const [name, children] of Object.entries(panels)) redraw(this.#panels[name], children);

    if (document.activeElement === document.body) this.#element.focus();
  }

  say(text) {
    clearTimeout(this.#timer);

    this.#message.textContent = text;
    this.#timer = setTimeout(() => this.#message.replaceChildren(), SHOWN_FOR);
  }

  suggest({ joints, keywords }) {
    this.#lists.replaceChildren(list("words-joints", joints), list("words-keywords", keywords));
  }

  syncNumbers(value) {
    for (const [label, name] of Object.entries(NUMBERS)) {
      const inputs = this.#panels.inspector.querySelectorAll(`[data-vector="${label}"] input`);

      inputs.forEach((input, axis) => {
        input.value = Math.round((value[name]?.[axis] ?? 0) * DIGITS) / DIGITS;
      });
    }
  }

  #divider() {
    const divider = el("div", { className: "divider", title: "Drag to resize the list. Double-click to reset it." });

    divider.addEventListener("dblclick", () => this.#element.style.removeProperty("--tree"));
    divider.addEventListener("pointerdown", event => this.#resize(divider, event));

    return divider;
  }

  #resize(divider, event) {
    const start = this.#panels.tree.offsetWidth - event.clientX;
    const move = now => this.#element.style.setProperty("--tree", `${start + now.clientX}px`);

    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    divider.addEventListener("pointermove", move);
    divider.addEventListener("lostpointercapture", () => divider.removeEventListener("pointermove", move), { once: true });
  }
}
