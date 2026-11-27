/*
  TokenMechs shows mechs on the canvas: a TokenPicture on each token which is a mech
  (see token-type.js), in place of its art.

  The assembly of an actor is made once and shared by its tokens; each token stands it
  up as a figure of its own. It is made anew when the items of the actor change, apart
  from changes to meshes only, which are what drawing it wrote.

  A mech walks as far as its token moved since the last frame, and turns to where the
  token faces, as fast as a token turns. LANCER locks the rotation of new actors to keep
  portraits upright, but a mech still has a facing, so by default it turns anyway.

  One token width is 100 units of a shape, times the size of the token.
*/

import { ensureItems } from "../items/ensure.js";
import { ID, kindOf, setting } from "../module.js";
import { Assembly, mechItemOf, responsible } from "../mechs/assembly.js";
import { quality } from "../settings.js";
import { keepPicture } from "../tokens/token-file.js";
import { isMechToken } from "../tokens/token-type.js";
import { TokenPicture } from "./token-picture.js";

export const UNITS_PER_TOKEN = 100;
const TURN_SPEED = 0.45;
const LONGEST_STEP = 100;

class TokenMechs {
  #pictures = new Map();
  #assemblies = new Map();
  #places = new WeakMap();
  #making = new Map();
  #waited = 0;
  #motion = null;
  #loading = null;

  activate(motion) {
    this.#loading = motion.then(loaded => {
      this.#motion = loaded;

      return loaded;
    });

    Hooks.on("drawToken", token => this.refresh(token));
    Hooks.on("refreshToken", token => this.#apply(token));
    Hooks.on("destroyToken", token => this.#detach(token));
    Hooks.on("updateToken", (document, changes) => this.#tokenChanged(document, changes));
    Hooks.on("updateActor", actor => this.#lancerChanged(actor));

    for (const hook of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(hook, (item, changes, options) => this.#itemChanged(item, hook === "updateItem" ? options : changes));
    }

    Hooks.on("canvasReady", () => {
      canvas.app.ticker.remove(this.#tick, this);
      canvas.app.ticker.add(this.#tick, this, PIXI.UPDATE_PRIORITY.LOW + 1);
    });
  }

  get motion() {
    return this.#motion;
  }

  has(token) {
    return this.#pictures.has(token);
  }

  pictureOf(token) {
    return this.#pictures.get(token) ?? null;
  }

  assemblyOf(actor) {
    return this.#assembly(actor);
  }

  refreshAll(filter = () => true) {
    if (!canvas?.ready) return;

    for (const token of canvas.tokens.placeables) if (filter(token)) this.refresh(token);
  }

  forget(actor) {
    const isCopy = token => !actor.isToken && !token.document.actorLink && token.document.actorId === actor.id;
    const shows = token => token.actor === actor || isCopy(token);

    this.#assemblies.delete(actor);

    for (const token of canvas?.tokens?.placeables ?? []) if (isCopy(token)) this.#assemblies.delete(token.actor);

    this.refreshAll(shows);
  }

  async refresh(token) {
    if (!token?.mesh || token.destroyed) return;

    const ticket = Symbol();

    this.#making.set(token, ticket);

    const picture = await this.#pictureFor(token).catch(error => {
      console.warn(`${ID} | ${token.name}:`, error);

      return null;
    });

    if (this.#making.get(token) !== ticket || token.destroyed) return picture?.destroy();

    this.#making.delete(token);

    const had = this.#pictures.has(token);

    this.#detach(token);

    if (!picture) return had && this.#restore(token);

    picture.turn(this.#heading(token));
    this.#pictures.set(token, picture);
    this.#apply(token);

    if (responsible(token.actor)) keepPicture(picture.assembly, token.document).catch(error => console.warn(`${ID} |`, error));
  }

  async #pictureFor(token) {
    const { actor } = token;

    if (!setting("enabled") || !actor || !isMechToken(token.document)) return null;
    if (!mechItemOf(actor)) {
      await ensureItems(actor);

      return null;
    }

    const assembly = await this.#assembly(actor);

    return assembly ? TokenPicture.of(assembly, await this.#loading) : null;
  }

  #assembly(actor) {
    if (!this.#assemblies.has(actor)) this.#assemblies.set(actor, Assembly.of(actor));

    return this.#assemblies.get(actor);
  }

  #tokenChanged(document, changes) {
    const isLook = ["actorId", "actorLink", "delta", "width", "height"].some(key => key in changes) || foundry.utils.hasProperty(changes, `flags.${ID}`);

    if (isLook) this.refresh(document.object);
  }

  #lancerChanged(actor) {
    ensureItems(actor);
  }

  #itemChanged(item, options) {
    const actor = item.parent;

    if (!(actor instanceof Actor)) return;
    if (!kindOf(item)) return ensureItems(actor);
    if (options?.[ID]?.meshes) return;

    this.forget(actor);
  }

  #heading({ document }) {
    const still = document.lockRotation && !setting("turnLocked");

    return 180 - (still ? 0 : document.rotation);
  }

  #scale({ document }) {
    const { width, height } = document.getSize();

    return Math.min(width, height) * Math.abs(document.texture.scaleX || 1) / UNITS_PER_TOKEN;
  }

  #apply(token) {
    const picture = this.#pictures.get(token);
    const { mesh } = token;

    if (!picture || !mesh || mesh.destroyed) return;

    const size = picture.worldSize * this.#scale(token);

    picture.resize(size * quality().scale);

    if (picture.dirty) picture.render();
    if (token.hasDynamicRing) mesh.setShaderClass(foundry.canvas.rendering.shaders.PrimaryBaseSamplerShader);

    mesh.texture = picture.texture;
    mesh.textureAlphaThreshold = 0;
    mesh.anchor.set(0.5, picture.anchorY);
    mesh.angle = 0;
    mesh.resize(size, size);
  }

  #detach(token) {
    const picture = this.#pictures.get(token);

    if (!picture) return;

    this.#pictures.delete(token);

    const { mesh } = token;

    if (mesh && !mesh.destroyed && mesh.texture === picture.texture) mesh.texture = PIXI.Texture.EMPTY;

    picture.destroy();
  }

  #restore(token) {
    if (token.mesh.destroyed) return;

    token.mesh.texture = token.texture ?? PIXI.Texture.EMPTY;
    token.renderFlags.set({ refreshMesh: true, refreshSize: true, refreshRotation: true, refreshShader: true });
  }

  #moved(token) {
    const { x, y } = token.position;
    const last = this.#places.get(token);

    this.#places.set(token, { x, y });

    if (!last) return 0;

    const distance = Math.hypot(x - last.x, y - last.y) / this.#scale(token);

    return distance > UNITS_PER_TOKEN ? 0 : distance;
  }

  #tick() {
    const { fps } = quality();
    const motion = setting("motion");

    this.#waited += canvas.app.ticker.elapsedMS;

    if (this.#waited < 1000 / fps) return;

    const passed = Math.min(this.#waited, LONGEST_STEP);

    this.#waited = 0;

    for (const [token, picture] of this.#pictures) {
      const distance = this.#moved(token);

      if (motion !== "off") picture.move(passed, distance, motion === "always");

      const limit = token.document.lockRotation ? TURN_SPEED * passed : Infinity;

      picture.turn(this.#heading(token), limit);

      if (!picture.dirty || !token.mesh?.visible) continue;

      picture.render();
    }
  }
}

export const tokenMechs = new TokenMechs();
