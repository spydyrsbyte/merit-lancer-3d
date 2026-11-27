/*
  The rules which are loaded: any number of files. They offer the words for joints and
  keywords, and say which words of a shape they do not know.
*/

import { button, el, heading, iconButton, note } from "../panels/ui.js";
import { Floating } from "./floating.js";

export class RulesWindow extends Floating {
  #workshop;

  constructor(parent, workshop) {
    super(parent, { title: "Rules", width: 340, className: "rules" });

    this.#workshop = workshop;
  }

  content() {
    const { book } = this.#workshop.session;
    const { all } = book;

    return [
      heading("Loaded rules", el("span", { className: "count", textContent: String(all.length) })),
      el("ol", { className: "entries" },
        ...all.map(rules => this.#row(rules)),
        all.length ? null : el("li", { className: "empty", textContent: "None yet." })),
      ...book.warnings.map(text => note(text, "problem")),
      button("Load rules", () => this.#workshop.desk.loadRules(), { symbol: "open", className: "main" }),
      note("Choose one or more files. Rules which are built on others need those as well.")
    ];
  }

  #row(rules) {
    const { major, minor } = rules.version;
    const what = [`${rules.conventions.length} words`, `${rules.keywords.length} keywords`];
    const basis = rules.basis ? `, on ${rules.basis.name}` : "";

    return el("li", {},
      el("span", { className: "name" }, el("strong", { textContent: rules.name }), el("small", { textContent: ` ${major}.${minor}${basis} · ${what.join(", ")}` })),
      iconButton("close", "Take it away", () => this.#workshop.desk.removeRules(rules.id)));
  }
}
