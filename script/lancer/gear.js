/*
  What an actor has according to LANCER: its frame, and the weapons, systems and mods of
  its loadout. Each is { lid, name, kind, size, weapon }, where size and weapon are only
  known of weapons, such as "Main" and "Melee".

  A frame brings integrated weapons and systems of its own, which are only known by
  their LANCER id. An NPC has a class instead of a frame, and weapons as features.

  Mechs and NPCs are drawn as mechs unless chosen otherwise.
*/

export const MECH_ACTORS = new Set(["mech", "npc"]);

const MAIN = "Main";
const INTEGRATED = "Integrated";

export function frameOf(actor) {
  if (actor?.type === "npc") return actor.items.find(item => item.type === "npc_class") ?? null;

  return actor?.system?.loadout?.frame?.value ?? actor?.items?.find(item => item.type === "frame") ?? null;
}

export function gearOf(actor) {
  if (actor?.type === "npc") return npcWeapons(actor);
  if (actor?.type !== "mech") return [];

  const loadout = actor.system?.loadout ?? {};
  const slots = (loadout.weapon_mounts ?? []).flatMap(mount => mount?.slots ?? []);
  const weapons = slots.map(slot => slot?.weapon?.value).filter(Boolean).map(item => gearItem(item, "weapon"));
  const mods = slots.map(slot => slot?.mod?.value).filter(Boolean).map(item => gearItem(item, "mod"));
  const systems = (loadout.systems ?? []).map(slot => slot?.value).filter(Boolean).map(item => gearItem(item, "system"));

  return [...weapons, ...integrated(frameOf(actor)), ...mods, ...systems];
}

function gearItem(item, kind) {
  const isWeapon = kind === "weapon";
  const profile = item.system?.active_profile ?? item.system?.profiles?.[0];

  return {
    lid: item.system?.lid ?? "",
    name: item.name,
    kind,
    size: isWeapon ? item.system?.size ?? MAIN : "",
    weapon: isWeapon ? profile?.type ?? item.system?.weapon_type ?? "" : ""
  };
}

function integrated(frame) {
  const { core_system: core, traits = [] } = frame?.system ?? {};
  const lids = [...core?.integrated ?? [], ...traits.flatMap(trait => trait?.integrated ?? [])].filter(lid => typeof lid === "string");

  return [...new Set(lids)].map(lid => {
    const isSystem = lid.startsWith("ms_");

    return { lid, name: "", kind: isSystem ? "system" : "weapon", size: isSystem ? "" : INTEGRATED, weapon: "" };
  });
}

function npcWeapons(actor) {
  const weapons = actor.items.filter(item => item.type === "npc_feature" && item.system?.type === "Weapon");

  return weapons.map(item => {
    const type = String(item.system?.weapon_type ?? "");
    const weapon = type.split(" ").at(-1) ?? "";

    return { lid: item.system?.lid ?? "", name: item.name, kind: "weapon", size: MAIN, weapon };
  });
}
