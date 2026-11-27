/*
  The panel of the Animation window when no step is chosen: the animation itself.

    name, plays     what it is for: a slot of the rules, or one of the shape's own
    length, loop    in slices; whether it plays over and over
    rules           those of the shape, which it follows
    requires        what has to be there, such as hip:02 or points.target. It can be
                    filled in from the joints the steps move
    optional        a list for whoever reads the file; nothing checks it
    AI made it      as with shapes, a person may switch it off for what is their own

  Definitions are animations inside of it, with a name and a length, which steps can
  play. The one which is edited is chosen here; their steps are in the timeline then.

  What does not fit is listed: what the engine finds wrong with the file, and why the
  rules would not take it for its slot.

  What the editor gives it:
    draft, json, scope, definitions, slots, rulesName, fits (reasons)
    setSetting(changes), setScope(name), addDefinition(name), removeDefinition(name),
    setLength(slices, scope), fillRequires(), followRules(), addStep()
*/

import { button, checkField, el, heading, note, numberField, select, textField, wordsField } from "./ui.js";

export function settingsPanel(editor) {
  const { json, scope } = editor;

  if (!json) return [heading("Animation"), note("Choose an animation on the left, or make a new one.")];

  const definition = scope ? json.define?.[scope] : null;
  const requires = (json.requires ?? []).map(one => typeof one === "string" ? one : JSON.stringify(one));

  return [
    heading("Animation"),
    textField("Name", json.name ?? "", { key: "animation name", done: name => editor.setSetting({ name: name || json.name }) }),
    textField("Plays", json.plays ?? "", { key: "animation plays", list: "animation-slots", done: plays => editor.setSetting({ plays }) }),
    lengthField("Length in slices", json.length ?? 30, "animation length", slices => editor.setLength(slices, "")),
    checkField("Loop", json.loop === true, loop => editor.setSetting({ loop })),
    el("p", { className: "hint", textContent: editor.rulesName ? `Follows the rules ${editor.rulesName}.` : "Follows no rules the workshop has." }),
    button("Follow the shape's rules", () => editor.followRules(), { disabled: !editor.canFollow }),
    textField("Requires", requires.filter(one => !one.startsWith("{")).join(", "), { key: "animation requires", hint: "hip:02, points.target", done: text => editor.setSetting({ requires: [...requiresOf(text), ...(json.requires ?? []).filter(one => typeof one !== "string")] }) }),
    requires.some(one => one.startsWith("{")) ? note(`And ${requires.filter(one => one.startsWith("{")).length} named requirements, which the JSON of the animation has.`) : null,
    button("From the joints the steps move", () => editor.fillRequires()),
    wordsField("Optional", json.optional ?? [], { key: "animation optional", done: words => editor.setSetting({ optional: words }) }),
    checkField("AI made it", json.author?.ai === 1, on => editor.setSetting({ author: { ...json.author, ai: on ? 1 : 0 } }), "Only a person may switch this off, for what they made without AI"),
    heading("Timeline"),
    el("label", { className: "field" }, el("span", { textContent: "Edit" }),
      select(scope, [["", "The animation"], ...editor.definitions.map(name => [name, `Definition: ${name}`])], name => editor.setScope(name), "animation scope")),
    definition ? lengthField("Definition length", definition.length ?? 30, "definition length", slices => editor.setLength(slices, scope)) : null,
    definition ? button("Delete this definition", () => editor.removeDefinition(scope), { symbol: "trash" }) : null,
    textField("New definition", "", { key: "new definition", hint: "such as step", done: name => name && editor.addDefinition(name) }),
    button("Add a step here", () => editor.addStep(), { symbol: "plus", title: "At the slice which is shown" }),
    ...problems(editor)
  ];
}

function lengthField(label, value, key, apply) {
  let typed = value;

  return numberField(label, value, { key, min: 0.01, set: number => {
    typed = number;
  }, done: () => typed > 0 && apply(typed) });
}

function problems(editor) {
  const found = [...editor.draft.problems, ...editor.fits];

  if (!found.length) return [];

  return [heading("To look at"), el("ul", { className: "problems" }, ...found.map(text => el("li", { textContent: text })))];
}

function requiresOf(text) {
  return text.split(/[,\s]+/).map(word => word.trim()).filter(Boolean);
}
