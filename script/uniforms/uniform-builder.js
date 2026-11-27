/*
  The Uniform Builder makes uniforms and puts them on the selected tokens. It is opened
  from the token controls, by a GM.

  Each standard color has a row of choices; one of them is picked for each mech. A row
  without choices keeps the mech's own color.
*/

import { STANDARD_NAMES } from "../../engine/shape-core/src/index.js";
import { say } from "../module.js";
import { action, choice, el, row } from "../sheets/dom.js";
import { dress, forgetUniform, keepUniform, uniforms } from "./uniforms.js";

const FIRST_COLOR = "#5a7f9c";

export class UniformBuilder extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "merit3d-uniforms",
    classes: ["merit3d-uniforms"],
    window: { title: "MERIT3D.Uniform.Title", resizable: true },
    position: { width: 460, height: "auto" }
  };

  #id = "";
  #uniform = { name: "", colors: {} };

  static open() {
    const open = foundry.applications.instances.get(UniformBuilder.DEFAULT_OPTIONS.id) ?? new UniformBuilder();

    return open.render({ force: true });
  }

  async _renderHTML() {
    const saved = uniforms();
    const options = [{ value: "", label: say("Uniform.New") }, ...Object.entries(saved).map(([id, one]) => ({ value: id, label: one.name || id }))];
    const name = el("input", { type: "text", value: this.#uniform.name, placeholder: say("Uniform.Name"), onchange: () => {
      this.#uniform.name = name.value;
    } });
    const selected = canvas.tokens?.controlled.length ?? 0;

    return el("div", { className: "merit3d-uniform" },
      row(say("Uniform.Uniform"), choice(this.#id, options, id => this.#choose(id))),
      row(say("Uniform.Name"), name),
      ...STANDARD_NAMES.map(color => this.#colorRow(color)),
      el("div", { className: "merit3d-buttons" },
        action(say("Uniform.Save"), "fa-floppy-disk", () => this.#save()),
        action(say("Uniform.Delete"), "fa-trash", () => this.#delete(), { disabled: !this.#id }),
        action(say("Uniform.PutOn", { count: selected }), "fa-shirt", () => this.#putOn(), { disabled: !selected })));
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  #colorRow(name) {
    const choices = this.#uniform.colors[name] ?? [];
    const swatches = choices.map((color, index) => el("span", { className: "merit3d-swatch" },
      el("input", { type: "color", value: color, onchange: event => this.#setColor(name, index, event.target.value) }),
      el("a", { className: "fa-solid fa-xmark", title: say("Uniform.Remove"), onclick: () => this.#removeColor(name, index) })));

    const add = el("a", { className: "fa-solid fa-plus", title: say("Uniform.Add"), onclick: () => this.#addColor(name) });

    return row(say(`Detail.Color.${name}`), ...swatches, add, choices.length ? null : el("span", { className: "hint", textContent: say("Uniform.Keep") }));
  }

  #choose(id) {
    this.#id = id;
    this.#uniform = id ? structuredClone(uniforms()[id]) : { name: "", colors: {} };
    this.render();
  }

  #setColor(name, index, color) {
    this.#uniform.colors[name][index] = color;
  }

  #addColor(name) {
    const choices = this.#uniform.colors[name] ?? [];

    this.#uniform.colors[name] = [...choices, choices.at(-1) ?? FIRST_COLOR];
    this.render();
  }

  #removeColor(name, index) {
    this.#uniform.colors[name].splice(index, 1);
    this.render();
  }

  async #save() {
    this.#id ||= foundry.utils.randomID();
    this.#uniform.name ||= say("Uniform.Unnamed");

    await keepUniform(this.#id, this.#uniform);
    this.render();
  }

  async #delete() {
    await forgetUniform(this.#id);
    this.#choose("");
  }

  async #putOn() {
    const tokens = canvas.tokens.controlled;
    const count = await dress(tokens, this.#uniform);

    ui.notifications.info(say("Uniform.Done", { count }));
  }
}

export function addUniformControl(controls) {
  if (!game.user.isGM || !controls.tokens) return;

  controls.tokens.tools.merit3dUniforms = {
    name: "merit3dUniforms",
    title: "MERIT3D.Uniform.Title",
    icon: "fa-solid fa-shirt",
    button: true,
    order: Object.keys(controls.tokens.tools).length,
    onChange: () => UniformBuilder.open()
  };
}
