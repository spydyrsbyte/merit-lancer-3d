/*
  What every part of the module needs: its id, where its files are, and its words.
*/

export const ID = "merit-lancer-3d";

export const TYPES = ["mech", "weapon", "system", "mod"];

export function typeOf(kind) {
  return `${ID}.${kind}`;
}

export function kindOf(item) {
  const [scope, kind] = String(item?.type ?? "").split(".");

  return scope === ID && TYPES.includes(kind) ? kind : "";
}

export function filePath(path) {
  return `modules/${ID}/${path}`;
}

export function say(key, data) {
  const full = `MERIT3D.${key}`;

  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function setting(key) {
  return game.settings.get(ID, key);
}
