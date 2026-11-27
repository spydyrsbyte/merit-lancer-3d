/*
  A Viewer is one more view, in an element which may be in another window. It has its
  own camera, and changes nothing.

  Its Camera says which of the open tabs it shows. It starts on the one which was being
  built when it was made. When it shows another tab than the one being built, what is
  being built is outlined wherever that tab uses it, such as a toe in the whole mech, and
  every change shows there at once, and what is selected in it is outlined there. When it
  shows the tab being built, what is selected is outlined. Outlines can be turned off.
  When its tab is closed, so is its window.

  Keys pressed there do what they do in the workshop, so undo works from any view.
*/

import { Figure } from "../../../shape-core/src/index.js";
import { keyAction } from "../panels/keys.js";
import { button, checkField, el, field, redraw, select } from "../panels/ui.js";
import { drawMarkers, drawSelected, drawUses, markersOf, placementsUsing } from "../view/markers.js";
import { View, VIEWS } from "../view/view.js";

const HINT = "Drag to orbit · Right-drag to slide · Scroll to zoom";
const DASH = [3, 5];

export class Viewer {
  #workshop;
  #draft;
  #view;
  #home;
  #camera;
  #markers = [];
  #uses = new Set();
  #outline = true;
  #closed;

  constructor(element, workshop, closed) {
    const home = element.ownerDocument;
    const viewport = home.createElement("section");
    const views = Object.entries(VIEWS).map(([name, { label }]) => button(label, () => this.#view.look(name)));

    this.#workshop = workshop;
    this.#draft = workshop.draft;
    this.#home = home;
    this.#closed = closed;
    this.#camera = el("div", { className: "camera" });

    viewport.className = "viewport";
    viewport.append(this.#camera, el("div", { className: "views" }, ...views, button("Fit", () => this.#view.fit())), el("p", { className: "hint over", textContent: HINT }));

    element.classList.add("shape-workshop", "lone");
    element.replaceChildren(viewport);
    element.addEventListener("keydown", event => keyAction(workshop, event));

    this.#view = new View(viewport, { draw: context => this.#drawOver(context) });
    this.#choices();
  }

  show(figure) {
    const isFirst = !this.#view.figure;
    const { draft, session } = this.#workshop;
    const isSame = draft === this.#draft;

    this.#markers = isSame ? markersOf(draft) : [];

    if (isSame) {
      this.#uses = new Set();
      this.#view.show(figure);
    } else {
      session.library.link(this.#draft.shape);
      this.#uses = placementsUsing(this.#draft.shape, draft.id);
      this.#view.show(new Figure(this.#draft.shape, this.#draft.surroundings, false));
    }

    if (isFirst) this.#view.look("angled");
  }

  refresh() {
    if (!this.#workshop.session.tabs.includes(this.#draft)) {
      this.#home.defaultView.close();

      return;
    }

    this.#choices();
    this.#view.moved();
  }

  draw() {
    this.#view.moved();
  }

  close() {
    this.#view.close();
    this.#closed();
  }

  #choices() {
    const { tabs } = this.#workshop.session;
    const chosen = String(tabs.indexOf(this.#draft));
    const list = tabs.map((draft, index) => [String(index), draft.name]);

    redraw(this.#camera, [
      field("Camera", select(chosen, list, index => this.#choose(tabs[Number(index)]), "camera")),
      checkField("Outline what is edited", this.#outline, isOn => {
        this.#outline = isOn;
        this.#view.draw();
      })
    ]);
  }

  #choose(draft) {
    this.#draft = draft;
    this.show(this.#workshop.view.figure);
    this.#view.fit();
  }

  #drawOver(context) {
    const { draft, selection } = this.#workshop;

    if (!this.#view.figure || !this.#outline) return;
    if (this.#uses.size) return this.#drawInside(context);
    if (draft !== this.#draft) return;

    drawSelected(context, this.#view, draft, selection);
    drawMarkers(context, this.#view, draft, this.#markers, selection);
  }

  #drawInside(context) {
    const { draft, selection } = this.#workshop;
    const chosen = selection.ids.filter(id => draft.get(id)?.kind === "shape");

    if (!chosen.length) return drawUses(context, this.#view, this.#uses);

    drawUses(context, this.#view, this.#uses, DASH);
    drawUses(context, this.#view, new Set(chosen));
  }
}
