/*
  The sheet of every item of the module has these tabs:
    Detail     for a mech, the Mech Designer (see designer/designer.js); for gear,
               quick changes (see detail.js)
    Token      for a mech: how its token picture looks (see token-tab.js)
    Workshop   the Shape Workshop, with Foundry as its host (see workshop-host.js)

  The workshop is made the first time its tab is opened, with the rules of LANCER and the
  shape of the item in it, and is kept while the sheet is open, also when the item
  changes. The Mech Designer is kept the same way. Closing the sheet asks about what was
  not saved in either.

  Keys pressed in the workshop are its own, so they do not move tokens or close windows.
*/

import { Workshop } from "../../engine/shape-workshop/src/workshop.js";
import { tokenMechs } from "../canvas/token-mechs.js";
import { kindOf, say } from "../module.js";
import { MechDesigner } from "../designer/designer.js";
import { detailOf } from "./detail.js";
import { el } from "./dom.js";
import { TokenTab } from "./token-tab.js";
import { WorkshopHost } from "./workshop-host.js";

const TABS = ["detail", "token", "workshop"];

export class ItemSheet3D extends foundry.applications.sheets.ItemSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["merit3d-sheet"],
    position: { width: 1200, height: 800 },
    window: { resizable: true }
  };

  #tab = "detail";
  #root = null;
  #panels = {};
  #buttons = {};
  #workshop = null;
  #host = null;
  #ticket = null;
  #token = null;
  #designer = null;

  get #tabs() {
    return kindOf(this.document) === "mech" ? TABS : TABS.filter(tab => tab !== "token");
  }

  showTab(tab) {
    this.#tab = this.#tabs.includes(tab) ? tab : "detail";

    if (this.#root) this.#showTab();
  }

  async _renderHTML() {
    this.#root ??= this.#build();

    await this.#showTab();

    return this.#root;
  }

  _replaceHTML(result, content) {
    if (result.parentElement !== content) content.replaceChildren(result);
  }

  async close(options = {}) {
    if (this.#designer?.isDirty && !options.force) {
      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: this.title },
        content: `<p>${say("Designer.Unsaved")}</p>`,
        buttons: [
          { action: "save", label: say("Designer.Save"), icon: "fa-solid fa-floppy-disk", default: true },
          { action: "discard", label: say("Designer.Discard"), icon: "fa-solid fa-trash" },
          { action: "cancel", label: say("Designer.Cancel"), icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });

      if (choice !== "save" && choice !== "discard") return this;
      if (choice === "save" && !await this.#designer.save()) return this;
    }

    this.#designer?.close();

    if (this.#workshop && !options.force) {
      const mayClose = await this.#workshop.desk.closeAll();

      if (!mayClose) return this;

      await this.#host.saving;
    }

    return super.close(options);
  }

  #build() {
    const tabs = this.#tabs.map(tab => {
      const button = el("button", { type: "button", className: "merit3d-tab", textContent: say(`Sheet.${tab}`), onclick: () => this.showTab(tab) });

      this.#buttons[tab] = button;

      return button;
    });

    this.#panels.detail = el("section", { className: "merit3d-panel detail" });
    this.#panels.token = el("section", { className: "merit3d-panel token" });
    this.#panels.workshop = el("section", { className: "merit3d-panel workshop", onkeydown: event => event.stopPropagation(), onkeyup: event => event.stopPropagation() });

    return el("div", { className: "merit3d-sheet-body" }, el("nav", { className: "merit3d-tabs" }, ...tabs), ...this.#tabs.map(tab => this.#panels[tab]));
  }

  #showTab() {
    for (const tab of this.#tabs) {
      this.#panels[tab].hidden = tab !== this.#tab;
      this.#buttons[tab].classList.toggle("active", tab === this.#tab);
    }

    if (this.#tab === "workshop") return this.#openWorkshop();
    if (this.#tab === "token") return this.#openToken();

    return this.#fillDetail();
  }

  async #openDesigner() {
    if (this.#designer) return;

    this.#designer = new MechDesigner(this.document);
    this.#panels.detail.replaceChildren(this.#designer.element);
    await this.#designer.load();
  }

  async #openToken() {
    if (this.#token) return;

    this.#token = new TokenTab(this.document);
    this.#panels.token.replaceChildren(this.#token.element);
    await this.#token.load();
  }

  async #fillDetail() {
    if (kindOf(this.document) === "mech") return this.#openDesigner();

    const ticket = Symbol();

    this.#ticket = ticket;

    const content = await detailOf(this.document).catch(error => el("p", { className: "notification error", textContent: error.message }));

    if (this.#ticket === ticket) this.#panels.detail.replaceChildren(content);
  }

  async #openWorkshop() {
    if (this.#workshop) return;

    const box = el("div", { className: "merit3d-workshop-box" });

    this.#panels.workshop.replaceChildren(box);
    this.#host = new WorkshopHost(this.document, tokenMechs.motion, (isUnsaved, name) => this.#marked(isUnsaved, name));
    this.#workshop = new Workshop(box, this.#host);

    await this.#workshop.desk.openRules(await this.#host.rules());

    const file = await this.#host.fileOf(this.document.system.mechdata.csgid);

    if (file) await this.#workshop.desk.open([file]);
  }

  #marked(isUnsaved, name) {
    this.#buttons.workshop?.classList.toggle("unsaved", isUnsaved);

    if (this.#buttons.workshop) this.#buttons.workshop.title = name ?? "";
  }
}
