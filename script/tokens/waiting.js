/*
  Token pictures which wait for a GM: a player who may not upload files marks the mech
  item, and the first GM who is there writes the picture, at the start or when the mark
  is made.
*/

import { Assembly } from "../mechs/assembly.js";
import { ID, kindOf } from "../module.js";
import { keepPicture } from "./token-file.js";

export function activateWaiting() {
  Hooks.on("updateItem", item => {
    if (isWaiting(item)) write(item);
  });

  if (isFirstGM()) {
    for (const item of waitingItems()) write(item);
  }
}

function isWaiting(item) {
  return isFirstGM() && kindOf(item) === "mech" && item.system.mechdata.needsToken && item.parent instanceof Actor;
}

function isFirstGM() {
  return game.users.activeGM === game.user;
}

function waitingItems() {
  const actors = [...game.actors, ...canvas?.tokens?.placeables.filter(token => !token.document.actorLink).map(token => token.actor) ?? []];

  return actors.flatMap(actor => actor?.items.filter(item => kindOf(item) === "mech" && item.system.mechdata.needsToken) ?? []);
}

async function write(item) {
  const actor = item.parent;
  const assembly = await Assembly.of(actor).catch(() => null);

  if (!assembly) return;

  const token = actor.isToken ? actor.token : null;

  await keepPicture(assembly, token).catch(error => console.warn(`${ID} |`, error));
}
