/*
  Whether a token is a mech or a regular token is chosen in its settings, below its
  image, for a token or for the prototype token of an actor, which decides for tokens
  that have no choice of their own. Mechs and NPCs are mechs unless chosen otherwise.

  The choice is a field of their form, so Foundry previews it and saves it with the rest.
  Unless it is changed, a token keeps following its actor.
*/

import { MECH_ACTORS } from "../lancer/gear.js";
import { ID, say } from "../module.js";

const DISPLAY = "display";
const ICONS = { mech: "fa-robot", art: "fa-image" };

export function displayOf(document) {
  const own = document?.getFlag?.(ID, DISPLAY) ?? document?.flags?.[ID]?.[DISPLAY];

  if (own) return own;

  const actor = document?.documentName === "Token" ? document.baseActor ?? document.actor : document;
  const prototype = actor?.prototypeToken?.flags?.[ID]?.[DISPLAY];

  return prototype ?? (MECH_ACTORS.has(actor?.type) ? "mech" : "art");
}

export function isMechToken(document) {
  return displayOf(document) === "mech";
}

export function addTokenType(app, element) {
  const image = element.querySelector('[name="texture.src"]')?.closest(".form-group");
  const document = app.isPrototype ? app.actor : app.document;

  if (!image || !document || element.querySelector(".merit3d-token-type")) return;

  const saved = displayOf(document);

  let display = app.token?.flags?.[ID]?.[DISPLAY] ?? saved;

  const group = globalThis.document.createElement("div");

  group.className = "form-group merit3d-token-type";
  group.innerHTML = `
    <label></label>
    <div class="form-fields">
      <input type="hidden" name="flags.${ID}.${DISPLAY}">
      <button type="button"><i inert></i> <span></span></button>
    </div>
    <p class="hint"></p>`;

  const input = group.querySelector("input");

  input.disabled = display === saved;

  const show = () => {
    const other = display === "mech" ? "art" : "mech";

    input.value = display;
    group.querySelector("label").textContent = say(`TokenType.${display}.Label`);
    group.querySelector(".hint").textContent = say(`TokenType.${display}.Hint`);
    group.querySelector("i").className = `fa-solid ${ICONS[other]}`;
    group.querySelector("button span").textContent = say(`TokenType.${other}.Convert`);
  };

  group.querySelector("button").addEventListener("click", () => {
    display = display === "mech" ? "art" : "mech";
    input.disabled = false;
    show();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  show();
  image.after(group);
}
