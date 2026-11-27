/*
  The HUD of a mech token has a button which opens the Detail of its mech item, where
  its look is changed.
*/

import { mechItemOf } from "../mechs/assembly.js";
import { say } from "../module.js";

export function addDetailButton(hud, html) {
  const element = html instanceof HTMLElement ? html : html?.[0];
  const mech = mechItemOf(hud.object?.actor);
  const column = element?.querySelector(".col.left");

  if (!mech || !column || column.querySelector(".merit3d-detail-button")) return;

  const button = document.createElement("button");

  button.type = "button";
  button.className = "control-icon merit3d-detail-button";
  button.dataset.tooltip = say("Hud.Detail");
  button.innerHTML = '<i class="fa-solid fa-robot" inert></i>';
  button.addEventListener("click", () => openDetail(mech));
  column.append(button);
}

export function openDetail(item) {
  const sheet = item.sheet;

  sheet.showTab?.("detail");
  sheet.render({ force: true });
}
