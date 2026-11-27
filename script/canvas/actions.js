/*
  Mechs act along with LANCER: they get ready while someone rolls, act when that is
  done, and react when they are hit.

  Ready is the attack played up to its first mark, such as "fire" or "hit", aimed at
  the first target, and held there (see token-picture.js). When the roll is done it is
  let go; when it is cancelled, or nothing comes of it for a long while, it stops. An
  attack which was not ready, as it was rolled by another program, plays from the start.

  Tech attacks play "tech", systems and activations "use", structure and overheating
  "stagger", and a mech which is destroyed goes "down".

  The weapon decides the place: if its gear item is in a hand, the attack is played for
  that hand, and the rules choose by what is in it. Otherwise it is for the whole mech.

  Shots, explosions and sounds are not made here. If Lancer Weapon FX shows them, mechs
  act in time with its effects, without it being changed: Sequencer, which plays them,
  says when they start and end. A shot of a mech starts at the muzzle of the weapon
  which fires it, as it is seen at that moment. The mech fires when its effect starts,
  and a target which is hit reacts when the effect ends, or reaches it. Without effects,
  it fires when the roll is done, and what it hit reacts a moment later.

  Whoever rolls tells everyone, and every player plays it on their own screen. Only the
  owner of a token may make it act.
*/

import { ID, setting } from "../module.js";
import { tokenMechs, UNITS_PER_TOKEN } from "./token-mechs.js";

const SOCKET = `module.${ID}`;
const EFFECTS = "lancer-weapon-fx";
const ATTACKS = { WeaponAttackFlow: "attack", BasicAttackFlow: "attack", TechAttackFlow: "tech" };
const DEEDS = { SystemFlow: "use", ActivationFlow: "use", CoreActiveFlow: "use", StabilizeFlow: "use", OverchargeFlow: "use", StructureFlow: "stagger", OverheatFlow: "stagger" };
const MELEE = "Melee";
const SLOW = /missile|rocket|grenade|mortar|boulder|arrow|snowball|throw/i;
const RADIANS = Math.PI / 180;

const TIMES = {
  ready: 180000,
  effect: 3000,
  hit: 500,
  slow: 2500,
  lower: 1800
};

const acts = new Map();

export function activateActions() {
  if (game.system.id !== "lancer") return;

  for (const [flow, name] of Object.entries(ATTACKS)) {
    Hooks.on(`lancer.preFlow.${flow}`, ({ state }) => tell(state.actor, { phase: "ready", ...attackOf(state, name) }));
    Hooks.on(`lancer.postFlow.${flow}`, ({ state }, done) => {
      if (!done) return tell(state.actor, { phase: "cancel" });

      const results = state.data?.hit_results ?? [];
      const aimed = state.data?.acc_diff?.targets ?? [];

      tell(state.actor, { phase: "act", ...attackOf(state, name), targets: idsOf(results.length ? results : aimed), hits: idsOf(results.filter(result => result.hit)) });
    });
  }

  for (const [flow, name] of Object.entries(DEEDS)) {
    Hooks.on(`lancer.postFlow.${flow}`, ({ state }, done) => {
      const isLast = state.data?.remStruct === 0 || state.data?.remStress === 0;

      if (isLast) tell(state.actor, { phase: "deed", name: "down" });
      else if (done) tell(state.actor, { phase: "deed", name });
    });
  }

  Hooks.on("preCreateSequencerEffect", data => beforeEffect(data));
  Hooks.on("createSequencerEffect", effect => effectStarted(effect.data));
  Hooks.on("endedSequencerEffect", effect => effectEnded(effect.data));
  Hooks.on("canvasTearDown", () => {
    for (const act of acts.values()) forget(act);
  });

  game.socket.on(SOCKET, (message, sender) => {
    if (message?.type !== "act") return;

    const document = fromUuidSync(message.token);

    if (document?.testUserPermission(game.users.get(sender), "OWNER")) perform(message);
  });
}

function attackOf({ item }, name) {
  const type = item?.system?.active_profile?.type ?? item?.system?.weapon_type ?? "";

  return { name, lid: item?.system?.lid ?? "", melee: type === MELEE, targets: [...game.user.targets].map(token => token.id) };
}

function idsOf(results) {
  return results.map(result => result.target?.id).filter(Boolean);
}

function tell(actor, message) {
  if (!actor || !canvas.ready || !setting("actions")) return;

  const tokens = actor.token ? [actor.token.object] : actor.getActiveTokens(true);
  const token = tokens.find(one => one?.controlled) ?? tokens[0];

  if (!token?.document.isOwner) return;

  const full = { type: "act", token: token.document.uuid, ...message };

  game.socket.emit(SOCKET, full);
  perform(full);
}

function perform(message) {
  const { token: uuid, phase, name } = message;
  const token = fromUuidSync(uuid)?.object;
  const picture = token && tokenMechs.pictureOf(token);

  if (!picture || !setting("actions")) {
    if (token && phase === "act") begin(uuid, { ...message, token, picture: null });

    return;
  }

  if (phase === "deed") return picture.play(name);

  const before = acts.get(uuid);

  if (phase === "cancel") {
    if (before && !before.isFired) {
      picture.stop(before.place);
      forget(before);
    }

    return;
  }

  if (phase === "ready") return getReady(uuid, token, picture, message);

  const isReady = Boolean(before) && !before.isDone && before.name === name;

  begin(uuid, { ...message, token, picture, isReady, place: isReady ? before.place : null });
}

function getReady(uuid, token, picture, { name, lid, melee, targets }) {
  const act = start(uuid, { token, picture, name, lid, melee, place: placeOf(picture, lid) });
  const points = pointsOf(act, targets[0]);
  const playing = picture.ready(name, { place: act.place, points });

  if (playing.reason && act.place) {
    act.place = "";
    picture.ready(name, { points });
  }

  later(act, TIMES.ready, () => {
    picture.stop(act.place);
    forget(act);
  });
}

function begin(uuid, { token, picture, name, lid = "", melee = false, targets = [], hits = [], isReady = false, place = null }) {
  const act = start(uuid, { token, picture, name, lid, melee, isReady, hits: new Set(hits) });

  act.place = place ?? (picture ? placeOf(picture, lid) : "");
  act.targets = targets;
  act.isDone = true;

  if (game.modules.get(EFFECTS)?.active) later(act, TIMES.effect, () => fire(act, true));
  else fire(act, true);

  return act;
}

function start(uuid, data) {
  const before = acts.get(uuid);

  if (before) clear(before);

  const act = { uuid, isFired: false, isDone: false, hits: new Set(), timers: new Set(), targets: [], ...data };

  act.isRanged = act.name === "attack" && !act.melee;
  acts.set(uuid, act);

  return act;
}

function fire(act, isAlone = false) {
  if (act.isFired) return;

  act.isFired = true;

  const { picture, name, place } = act;

  if (picture && !(act.isReady && picture.release(place))) {
    const playing = picture.play(name, { place, points: pointsOf(act, act.targets[0]) });

    if (playing?.reason && place) picture.play(name, { points: pointsOf(act, act.targets[0]) });
  }

  if (isAlone) {
    for (const id of act.hits) later(act, TIMES.hit, () => hit(act, id));
  }

  lowerLater(act);
}

function hit(act, id) {
  if (!act.hits.delete(id)) return;

  const token = canvas.tokens.get(id);

  if (token && !acts.has(token.document.uuid)) tokenMechs.pictureOf(token)?.play("hit");
}

function placeOf(picture, lid) {
  if (!lid) return "";

  const item = picture.assembly.gear.find(one => one.system.mechdata.id === lid);
  const at = item && mountOf(picture, item)?.at;

  return at?.startsWith("hand") ? at : "";
}

function mountOf(picture, item) {
  return picture.assembly.mounts.find(mount => mount.item === item.id) ?? null;
}

function weaponOf(act) {
  const gear = act.picture?.assembly.gear ?? [];
  const item = gear.find(one => one.system.mechdata.id === act.lid) ?? gear.find(one => one.type.endsWith(".weapon") && mountOf(act.picture, one)?.at === act.place);

  return item ? mountOf(act.picture, item) : null;
}

function pointsOf(act, id) {
  const target = canvas.tokens.get(id);

  if (!target || target === act.token) return {};

  return { target: pointOf(act.token, target, act.picture) };
}

function scaleOf(token) {
  const { width, height } = token.document.getSize();

  return Math.min(width, height) * Math.abs(token.document.texture.scaleX || 1) / UNITS_PER_TOKEN;
}

function pointOf(token, target, picture) {
  const scale = scaleOf(token);
  const right = (target.center.x - token.center.x) / scale;
  const up = (token.center.y - target.center.y) / scale;
  const rise = (target.document.elevation - token.document.elevation) * canvas.dimensions.distancePixels / scale;
  const turn = picture.heading * RADIANS;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  return [cos * right + sin * up, cos * up - sin * right, rise];
}

function placeOfEffect(data, key) {
  const place = data[key];
  const uuidOf = one => (typeof one === "string" ? one : one?.uuid) ?? null;
  const named = typeof place === "string" ? data.nameOffsetMap?.[place] : null;

  return named ? uuidOf(named.target || named.source) : uuidOf(place);
}

function beforeEffect(data) {
  const act = acts.get(placeOfEffect(data, "source"));

  if (!act?.isDone || !act.isRanged || !act.picture || !data.target || data.attachTo?.active) return;

  const own = data.offset?.source;

  if (own?.local) return;

  const mount = weaponOf(act);
  const muzzle = mount && act.picture.muzzle(mount.placement);

  if (!muzzle) return;

  const scale = scaleOf(act.token);
  const unit = own?.gridUnits ? canvas.grid.size : 1;

  data.offset = {
    target: false,
    ...data.offset,
    source: { ...own, x: (own?.x ?? 0) + muzzle.x * scale / unit, y: (own?.y ?? 0) + muzzle.y * scale / unit }
  };
}

function effectStarted(data) {
  const at = placeOfEffect(data, "source");
  const to = data.target ? placeOfEffect(data, "target") : null;
  const act = acts.get(at);

  if (act?.isDone) {
    const target = to ? fromUuidSync(to)?.id : null;

    later(act, data.delay ?? 0, () => {
      fire(act);
      lowerLater(act);
    });

    if (target && act.hits.has(target)) {
      const time = SLOW.test(String(data.file)) ? TIMES.slow : TIMES.hit;

      later(act, (data.delay ?? 0) + time, () => hit(act, target));
    }

    return;
  }

  if (to) return;

  const id = at ? fromUuidSync(at)?.id : null;

  if (!id) return;

  for (const other of acts.values()) {
    if (other.isFired && other.hits.has(id)) later(other, data.delay ?? 0, () => hit(other, id));
  }
}

function effectEnded(data) {
  const act = acts.get(placeOfEffect(data, "source"));

  if (!act?.isDone || !data.target) return;

  const id = fromUuidSync(placeOfEffect(data, "target") ?? "")?.id;

  if (id) hit(act, id);
}

function later(act, time, callback) {
  const timer = setTimeout(() => {
    act.timers.delete(timer);
    callback();
  }, time);

  act.timers.add(timer);

  return timer;
}

function lowerLater(act) {
  clearTimeout(act.lower);
  act.timers.delete(act.lower);
  act.lower = later(act, act.hits.size ? TIMES.slow + TIMES.lower : TIMES.lower, () => forget(act));
}

function clear(act) {
  for (const timer of act.timers) clearTimeout(timer);

  act.timers.clear();
}

function forget(act) {
  clear(act);

  if (acts.get(act.uuid) === act) acts.delete(act.uuid);
}
