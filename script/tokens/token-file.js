/*
  The token picture of a mech is its image, and it holds the mech as well: the shape of
  its loadout with everything in it, as changed for this mech, and in the meta of that
  shape the LANCER ids, shapes and mounts of its items. The meshes are left out, as
  they are made again when it is opened. So players can share their mech by its picture
  (see the Detail of a mech item, which opens one).

  It is in the world's assets:
    assets/merit-lancer-3d/tokens/<actor id>.png             linked tokens and the prototype
    assets/merit-lancer-3d/tokens/unlinked/<token id>.png    tokens with an actor of their own

  It looks like a token (see token-image.js), as the image of the mech item says.

  It is written again when what it shows has changed, which a fingerprint of the shapes
  in it and of its image says. Whoever looks after the actor writes it. A player who may not upload files
  marks the mech item instead, and keeps the picture there was, and the first GM who is
  there writes it.
*/

import { Picture } from "../../engine/shape-core/src/index.js";
import { idOf } from "../mechs/loadout.js";
import { ID } from "../module.js";
import { imageOf, tokenBytes } from "./token-image.js";

const FOLDER = `assets/${ID}/tokens`;
const UNLINKED = `${FOLDER}/unlinked`;
const SOURCE = "data";
const PRINT = "print";

export function pictureOf(assembly) {
  const shapes = [...assembly.shape.everything].map(one => ({ ...JSON.parse(JSON.stringify(one)), data: { uri: "" } }));
  const top = shapes.find(json => json.id === assembly.shape.id);

  top.meta = { ...top.meta, lancer: { mech: dataOf(assembly.mech), gear: assembly.gear.map(item => ({ ...dataOf(item), at: atOf(assembly, item) })) } };

  return new Picture(assembly.shape.id, shapes, []);
}

const writing = new WeakMap();

export function keepPicture(assembly, token) {
  const isLinked = !token || token.actorLink;
  const owner = isLinked ? assembly.actor : token;

  if (!writing.has(owner)) writing.set(owner, write(assembly, token, isLinked, owner).finally(() => writing.delete(owner)));

  return writing.get(owner);
}

async function write(assembly, token, isLinked, owner) {
  const shapes = pictureOf(assembly).shapes;
  const print = idOf(JSON.stringify([shapes, imageOf(assembly.mech)]));

  if (owner.getFlag(ID, PRINT) === print) return false;

  if (!game.user.can("FILES_UPLOAD")) {
    if (!assembly.mech.system.mechdata.needsToken) await assembly.mech.update({ "system.mechdata.needsToken": true });

    return false;
  }

  const folder = isLinked ? FOLDER : UNLINKED;
  const name = `${isLinked ? assembly.actor.id : token.id}.png`;
  const bytes = await pictureOf(assembly).into(await tokenBytes(assembly.shape, imageOf(assembly.mech)));
  const path = await upload(folder, name, bytes);

  if (!path) return false;

  const source = `${path}?${Date.now().toString(36)}`;

  if (isLinked) await assembly.actor.update({ "prototypeToken.texture.src": source, [`flags.${ID}.${PRINT}`]: print });
  else await token.update({ [`flags.${ID}.${PRINT}`]: print });

  for (const shown of tokensOf(assembly.actor, token)) await shown.update({ "texture.src": source }, { [ID]: { picture: true } });

  if (assembly.mech.system.mechdata.needsToken) await assembly.mech.update({ "system.mechdata.needsToken": false });

  return true;
}

export async function readPicture(bytes) {
  const picture = await Picture.read(bytes).catch(() => null);

  if (!picture) return null;

  const top = picture.shapes.find(json => json.id === picture.top);

  return { shapes: picture.shapes, top, lancer: top?.meta?.lancer ?? null };
}

function dataOf(item) {
  const { id, csgid } = item.system.mechdata;

  return { id, kind: item.type.split(".").at(-1), csgid };
}

function atOf(assembly, item) {
  return assembly.mounts.find(mount => mount.item === item.id)?.at ?? item.system.mechdata.at;
}

function tokensOf(actor, token) {
  if (token && !token.actorLink) return [token];

  return game.scenes.contents.flatMap(scene => scene.tokens.filter(one => one.actorLink && one.actorId === actor.id));
}

async function upload(folder, name, bytes) {
  const picker = foundry.applications.apps.FilePicker.implementation;

  for (const path of [`assets/${ID}`, FOLDER, folder]) await picker.createDirectory(SOURCE, path).catch(() => null);

  const file = new File([bytes], name, { type: "image/png" });
  const answer = await picker.upload(SOURCE, folder, file, {}, { notify: false }).catch(error => {
    console.warn(`${ID} | the token picture could not be saved:`, error);

    return null;
  });

  return answer?.path ?? null;
}
