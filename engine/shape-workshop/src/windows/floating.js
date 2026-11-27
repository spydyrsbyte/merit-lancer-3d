/*
  A Floating window is in front of the workshop, and can be moved by its title. What is
  in it is drawn anew whenever something changes.
*/

import { el, iconButton, redraw } from "../panels/ui.js";

const MARGIN = 40;
const PROPERTIES = 286;
const BELOW_BAR = 124;

export class Floating {
  #parent;
  #title;
  #body;

  constructor(parent, { title, width, height, className = "" }) {
    this.#parent = parent;
    this.#title = el("span", { className: "title", textContent: title });
    this.#body = el("div", { className: "body" });
    this.isOpen = false;

    const bar = el("header", { on: { pointerdown: event => this.#drag(event) } }, this.#title, iconButton("close", "Close", () => this.close()));

    this.element = el("section", { className: `floating ${className}`, tabIndex: -1 }, bar, this.#body);
    this.element.style.width = `${width}px`;

    if (height) this.element.style.height = `${height}px`;

    this.element.addEventListener("pointerdown", () => this.#toFront());
  }

  get body() {
    return this.#body;
  }

  set title(text) {
    this.#title.textContent = text;
  }

  open() {
    if (!this.isOpen) {
      this.isOpen = true;
      this.#parent.append(this.element);
      this.refresh();
      this.#start();
    }

    this.#toFront();
    this.refresh();
  }

  close() {
    this.isOpen = false;
    this.element.remove();
  }

  refresh() {
    if (this.isOpen) redraw(this.#body, this.content());
  }

  content() {
    return [];
  }

  #toFront() {
    if (this.#parent.lastElementChild !== this.element) this.#parent.append(this.element);
  }

  #start() {
    const { clientWidth, clientHeight } = this.#parent;
    const { offsetWidth, offsetHeight } = this.element;

    if (this.element.style.left) return;

    const beside = clientWidth - PROPERTIES - offsetWidth;
    const left = offsetWidth > clientWidth / 2 ? (clientWidth - offsetWidth) / 2 : beside;

    this.#moveTo(left, Math.min(BELOW_BAR, clientHeight - offsetHeight));
  }

  #moveTo(left, top) {
    const { clientWidth, clientHeight } = this.#parent;

    this.element.style.left = `${Math.max(MARGIN - this.element.offsetWidth, Math.min(clientWidth - MARGIN, left))}px`;
    this.element.style.top = `${Math.max(0, Math.min(clientHeight - MARGIN, top))}px`;
  }

  #drag(event) {
    if (event.target.closest("button")) return;

    const bar = event.currentTarget;
    const { offsetLeft, offsetTop } = this.element;
    const move = now => this.#moveTo(offsetLeft + now.clientX - event.clientX, offsetTop + now.clientY - event.clientY);

    bar.setPointerCapture(event.pointerId);
    bar.addEventListener("pointermove", move);
    bar.addEventListener("lostpointercapture", () => bar.removeEventListener("pointermove", move), { once: true });
  }
}
