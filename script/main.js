/*
  MERIT LANCER 3D: mechs as 3D tokens, made with CSG Bash (the engine in engine/).

  At init the items, settings and token pictures are made known. Motion, the rules and
  animations, is loaded once, and mechs wait for it. When the world is ready, LANCER's
  rolls are followed, and waiting token pictures are written.
*/

import { activateActions } from "./canvas/actions.js";
import { tokenMechs } from "./canvas/token-mechs.js";
import { registerItems } from "./items/types.js";
import { Motion } from "./mechs/motion.js";
import { filePath, ID } from "./module.js";
import { registerSettings } from "./settings.js";
import { addDetailButton, openDetail } from "./tokens/hud.js";
import { addTokenType } from "./tokens/token-type.js";
import { activateWaiting } from "./tokens/waiting.js";
import { addUniformControl, UniformBuilder } from "./uniforms/uniform-builder.js";

const motion = Motion.load(async path => (await fetch(filePath(path))).json());

Hooks.once("init", () => {
  registerSettings(() => tokenMechs.refreshAll());
  registerItems();
  tokenMechs.activate(motion);

  game.modules.get(ID).api = {
    tokenMechs,
    uniforms: () => UniformBuilder.open(),
    detail: item => openDetail(item),
    play: (token, name, options) => tokenMechs.pictureOf(token?.object ?? token)?.play(name, options)
  };
});

Hooks.once("ready", async () => {
  for (const note of (await motion).notes) console.warn(`${ID} | ${note}`);

  activateActions();
  activateWaiting();

  tokenMechs.refreshAll();
});

Hooks.on("renderTokenConfig", addTokenType);
Hooks.on("renderPrototypeTokenConfig", addTokenType);
Hooks.on("renderTokenHUD", addDetailButton);
Hooks.on("getSceneControlButtons", addUniformControl);
