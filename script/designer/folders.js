/*
  Folders of the library, as the Mech Designer showed them: every entry has a path,
  such as "GMS/ranged/main", and the list has each folder which holds entries, in order,
  with its entries by name.

  What waits for approval goes where it will be (see tools/pack.js).
*/

const DEEPEST = 5;
const WAITING = "tobeapproved/";
const SIZE_FOLDERS = { Auxiliary: "aux", Main: "main", Heavy: "heavy", Superheavy: "superheavy", "Ship-class": "ship-class" };

export function folderOf(entry) {
  const folder = String(entry.folder ?? "");

  if (!folder.startsWith(WAITING)) return folder;

  const maker = folder.slice(WAITING.length).split("/")[0];

  if (entry.kind === "mech") return maker;
  if (entry.type === "weapon") return entry.weapon === "Melee" ? `${maker}/melee` : `${maker}/ranged/${SIZE_FOLDERS[entry.sizes?.[0]] ?? "main"}`;

  return `${maker}/${entry.type}s`;
}

export function folderList(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const path = String(entry.folder ?? "").split("/").map(part => part.trim()).filter(Boolean).slice(0, DEEPEST).join("/");

    if (!groups.has(path)) groups.set(path, []);

    groups.get(path).push(entry);
  }

  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

  return [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([path, list]) => ({ path, entries: list.sort(byName) }));
}
