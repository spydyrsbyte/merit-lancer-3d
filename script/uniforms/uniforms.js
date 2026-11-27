/*
  A Uniform is a shared look for many mechs, such as a squad of NPCs: for each of the
  five standard colors, one color or several to choose from. Each mech it is put on
  gets one of them at random, so mechs of one uniform are alike but not the same. A
  color left empty keeps the mech's own.

  It goes on the mech item of each token, so a token with an actor of its own gets a
  look and a token picture of its own. Putting it on again picks again.

  Uniforms are kept in the world, for any frame:
    { id: { name, colors: { primary: ["#334455", ...], ... } } }

  Insignia, which the old uniforms had too, are not drawn by the engine yet, so they are
  not part of these.
*/

import { STANDARD_NAMES } from "../../engine/shape-core/src/index.js";
import { customize, paintOf } from "../items/customize.js";
import { mechItemOf } from "../mechs/assembly.js";
import { ID } from "../module.js";

const KEY = "uniforms";

export function uniforms() {
  return game.settings.get(ID, KEY) ?? {};
}

export async function keepUniform(id, uniform) {
  await game.settings.set(ID, KEY, { ...uniforms(), [id]: uniform });
}

export async function forgetUniform(id) {
  const { [id]: gone, ...others } = uniforms();

  await game.settings.set(ID, KEY, others);
}

export async function dress(tokens, uniform) {
  let dressed = 0;

  for (const token of tokens) {
    const mech = mechItemOf(token.actor);

    if (!mech) continue;

    const picked = pick(uniform);

    if (await customize(mech, json => {
      for (const [name, color] of Object.entries(picked)) paintOf(json, name, color);
    })) dressed++;
  }

  return dressed;
}

function pick({ colors = {} }) {
  const picked = {};

  for (const name of STANDARD_NAMES) {
    const choices = colors[name] ?? [];

    if (choices.length) picked[name] = choices[Math.floor(Math.random() * choices.length)];
  }

  return picked;
}
