/*
  The settings. How mechs are drawn is up to each player, as it is their computer which
  draws them. Whether they act along with LANCER, and how they turn, is up to the world.

  Quality is how many pixels of a texture there are to one on the screen, and how often a
  second they are drawn.
*/

import { ID } from "./module.js";

export const QUALITY = [
  { scale: 0.75, fps: 15 },
  { scale: 1, fps: 20 },
  { scale: 1, fps: 30 },
  { scale: 1.5, fps: 60 },
  { scale: 2, fps: 60 }
];

export const MOTION = ["off", "moving", "always"];

export function registerSettings(redraw) {
  const register = (key, data) => game.settings.register(ID, key, {
    name: `MERIT3D.Setting.${key}.Name`,
    hint: `MERIT3D.Setting.${key}.Hint`,
    config: true,
    ...data
  });

  register("enabled", { scope: "client", type: Boolean, default: true, onChange: redraw });
  register("quality", { scope: "client", type: Number, default: 4, range: { min: 1, max: QUALITY.length, step: 1 }, onChange: redraw });
  register("motion", { scope: "client", type: String, default: "always", choices: Object.fromEntries(MOTION.map(key => [key, `MERIT3D.Setting.motion.${key}`])) });
  register("actions", { scope: "world", type: Boolean, default: true });
  register("turnLocked", { scope: "world", type: Boolean, default: true, onChange: redraw });

  game.settings.register(ID, "uniforms", { scope: "world", config: false, type: Object, default: {} });
}

export function quality() {
  return QUALITY[game.settings.get(ID, "quality") - 1] ?? QUALITY.at(-2);
}
