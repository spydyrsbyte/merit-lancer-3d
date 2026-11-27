/*
  The Token tab of a mech item: how its token picture looks (see tokens/token-image.js).
  It is for those who do not draw mechs in 3D, and see the picture instead.

  The preview is the picture itself. Dragging on it turns the camera, around and up or
  down, and the wheel zooms. The ring has a style and a color, and inside of it is a
  background or nothing. Outside of the ring the picture is clear.

  Nothing changes until it is used as the token. Then the image of the mech item is
  kept, camera and zoom too, so it can be made again, and the token picture is written
  as any other time it changes.

  Download gives the picture as it is shown, with the mech in it, to share as a file.
*/

import { tokenMechs } from "../canvas/token-mechs.js";
import { say } from "../module.js";
import { pictureOf } from "../tokens/token-file.js";
import { drawToken, imageOf, RINGS, tokenBytes, USUAL } from "../tokens/token-image.js";
import { action, choice, el, row } from "./dom.js";

const SIZE = 512;
const TURNING = 0.5;
const LEANING = 0.3;
const ZOOMING = 0.0015;
const ZOOM_LIMITS = [0.25, 4];

export class TokenTab {
  #item;
  #settings;
  #shape = null;
  #assembly = null;
  #preview = el("canvas", { className: "merit3d-token-preview", width: SIZE, height: SIZE });
  #request = null;

  constructor(item) {
    this.#item = item;
    this.#settings = imageOf(item);
    this.element = el("div", { className: "merit3d-token" });
  }

  async load() {
    const actor = this.#item.parent instanceof Actor ? this.#item.parent : null;
    const assembly = actor ? await tokenMechs.assemblyOf(actor).catch(() => null) : null;

    this.#assembly = assembly;
    this.#shape = assembly?.shape ?? null;

    if (!this.#shape) {
      this.element.replaceChildren(el("p", { className: "hint", textContent: say("Token.NoMech") }));

      return;
    }

    this.#listen();
    this.#build();
    this.#draw();
  }

  #build() {
    const settings = this.#settings;
    const canEdit = this.#item.isOwner;
    const ring = choice(settings.ring, RINGS.map(name => ({ value: name, label: say(`Token.Ring.${name}`) })), value => this.#set({ ring: value }));
    const color = el("input", { type: "color", value: settings.color || USUAL.color, oninput: () => this.#set({ color: color.value }) });
    const clear = el("input", { type: "checkbox", checked: !settings.background, onchange: () => this.#set({ background: clear.checked ? "" : background.value }) });
    const background = el("input", { type: "color", value: settings.background || "#1b2028", oninput: () => {
      clear.checked = false;
      this.#set({ background: background.value });
    } });

    this.element.replaceChildren(
      el("div", { className: "merit3d-token-stage" }, this.#preview, el("p", { className: "hint", textContent: say("Token.Hint") })),
      el("fieldset", { disabled: !canEdit },
        row(say("Token.RingStyle"), ring),
        row(say("Token.RingColor"), color),
        row(say("Token.Background"), background, el("label", { className: "checkbox" }, clear, ` ${say("Token.Clear")}`)),
        el("div", { className: "merit3d-buttons" },
          action(say("Token.Camera"), "fa-video", () => this.#set({ heading: USUAL.heading, tilt: USUAL.tilt, zoom: USUAL.zoom })),
          action(say("Token.Use"), "fa-floppy-disk", () => this.#use()))),
      el("div", { className: "merit3d-buttons" }, action(say("Token.Download"), "fa-download", () => this.#download())));
  }

  #listen() {
    const preview = this.#preview;

    preview.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;

      preview.setPointerCapture(event.pointerId);

      let last = [event.clientX, event.clientY];

      const move = now => {
        const { heading, tilt } = this.#settings;
        const right = now.clientX - last[0];
        const down = now.clientY - last[1];

        last = [now.clientX, now.clientY];
        this.#set({ heading: (heading - right * TURNING + 360) % 360, tilt: Math.max(0, Math.min(90, tilt + down * LEANING)) });
      };

      preview.addEventListener("pointermove", move);
      preview.addEventListener("lostpointercapture", () => preview.removeEventListener("pointermove", move), { once: true });
    });

    preview.addEventListener("wheel", event => {
      event.preventDefault();

      const zoom = this.#settings.zoom * Math.exp(-event.deltaY * ZOOMING);

      this.#set({ zoom: Math.max(ZOOM_LIMITS[0], Math.min(ZOOM_LIMITS[1], zoom)) });
    }, { passive: false });
  }

  #set(changes) {
    Object.assign(this.#settings, changes);
    this.#request ??= requestAnimationFrame(() => {
      this.#request = null;
      this.#draw();
    });
  }

  #draw() {
    if (this.#shape) drawToken(this.#shape, this.#settings, SIZE, this.#preview);
  }

  async #download() {
    const bytes = await pictureOf(this.#assembly).into(await tokenBytes(this.#shape, this.#settings));
    const address = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    const link = el("a", { href: address, download: `${this.#assembly.actor.name}.png` });

    link.click();
    setTimeout(() => URL.revokeObjectURL(address), 1000);
  }

  async #use() {
    const image = { ...this.#settings, heading: Math.round(this.#settings.heading), tilt: Math.round(this.#settings.tilt), zoom: Math.round(this.#settings.zoom * 100) / 100 };

    await this.#item.update({ "system.mechdata.image": image });
    ui.notifications.info(say("Token.Used", { name: this.#item.parent?.name ?? this.#item.name }));
  }
}
