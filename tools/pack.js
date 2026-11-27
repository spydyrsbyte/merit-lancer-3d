/*
  Builds the compendium of the module, packs/library, from its library: an item for each
  LANCER id of each frame, weapon, system and mod, and the two stand-ins.

  Each item carries everything it shows: in its customization every shape it uses, and
  its meshes, so nothing is fetched or cut when it is used. Its id comes from the shape
  and the LANCER id, so it is the same every time it is built, and items made from it
  stay linked to it by their cid.

  The folders are those of the library: a manufacturer, with its mechs in it, and melee,
  ranged by size, systems and mods. What waits for approval goes where it will be.

  A compendium is a LevelDB database. Foundry comes with the library which writes them,
  so that is used, from where Foundry is:
    node tools/pack.js [folder of Foundry's app]

  The pack cannot be written while Foundry has it open: a world with the module active
  has to be closed first.
*/

import { existsSync, renameSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Library } from "../engine/shape-core/src/index.js";
import { kindFor, STAND_INS } from "../script/items/catalog.js";
import { pack, piecesOf } from "../script/items/meshes.js";
import { ID, typeOf } from "../script/module.js";

const MODULE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FOUNDRY = process.argv[2] ?? join(MODULE, "../foundry/App/resources/app");
const TARGET = join(MODULE, "packs/library");
const BUILDING = join(MODULE, "packs/library-building");
const WAITING = "tobeapproved/";
const STAND_IN_FOLDER = "Stand-ins";
const SIZE_FOLDERS = { Auxiliary: "aux", Main: "main", Heavy: "heavy", Superheavy: "superheavy", "Ship-class": "ship-class" };

const ICONS = { mech: "icons/svg/statue.svg", weapon: "icons/svg/sword.svg", system: "icons/svg/upgrade.svg", mod: "icons/svg/item-bag.svg" };
const STATS = { compendiumSource: null, duplicateSource: null, exportSource: null, coreVersion: "13.351", systemId: "lancer", systemVersion: "3.1.3", createdTime: 0, modifiedTime: 0, lastModifiedBy: null };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const STAND_IN_ENTRIES = [
  { id: STAND_INS.weapon, name: "Weapon stand-in", kind: "part", type: "weapon", lids: [""], file: "stand-ins/weapon.json" },
  { id: STAND_INS.system, name: "System stand-in", kind: "part", type: "system", lids: [""], file: "stand-ins/system.json" }
];

const { ClassicLevel } = createRequire(join(FOUNDRY, "package.json"))("classic-level");

const source = {
  async read(key) {
    const id = key.split("@")[0];
    const standIn = STAND_IN_ENTRIES.find(entry => entry.id === id);
    const path = standIn ? standIn.file : `library/shapes/${id}.json`;

    return JSON.parse(await readFile(join(MODULE, path), "utf8").catch(() => "null"));
  },
  open: async () => null,
  mesh: () => null
};

const entries = [...JSON.parse(await readFile(join(MODULE, "library/index.json"), "utf8")), ...STAND_IN_ENTRIES];
const folders = new Map();
const items = [];

for (const entry of entries) {
  const library = new Library([source]);
  const shape = await library.load(entry.id);
  const customization = Object.fromEntries([...shape.everything].filter(one => !one.builtin).map(one => [one.id, JSON.parse(JSON.stringify(one))]));
  const meshes = await pack(piecesOf(shape));
  const kind = kindFor(entry);
  const folder = folderOf(entry.file ? STAND_IN_FOLDER : placeOf(entry));

  for (const lid of entry.lids) {
    items.push({
      _id: idOf(`${entry.id}/${lid}`),
      name: entry.name,
      type: typeOf(kind),
      img: ICONS[kind],
      folder,
      system: { mechdata: { id: lid, cid: "", csgid: entry.id, at: "", meshes, needsToken: false }, customization },
      flags: { [ID]: { folder: entry.folder ?? STAND_IN_FOLDER } },
      effects: [],
      sort: 0,
      ownership: { default: 0 },
      _stats: STATS
    });
  }
}

rmSync(BUILDING, { recursive: true, force: true });

const database = new ClassicLevel(BUILDING, { keyEncoding: "utf8", valueEncoding: "json" });

await database.open();

const batch = database.batch();

for (const folder of folders.values()) batch.put(`!folders!${folder._id}`, folder);
for (const item of items) batch.put(`!items!${item._id}`, item);

await batch.write();
await database.compactRange("\x00", "\xff");
await database.close();

if (existsSync(TARGET)) rmSync(TARGET, { recursive: true });

renameSync(BUILDING, TARGET);

console.log(`${items.length} items in ${folders.size} folders`);

function placeOf(entry) {
  if (!entry.folder?.startsWith(WAITING)) return entry.folder ?? "";

  const manufacturer = entry.folder.slice(WAITING.length).split("/")[0];
  const kind = kindFor(entry);

  if (kind === "mech") return manufacturer;
  if (kind === "weapon") return entry.weapon === "Melee" ? `${manufacturer}/melee` : `${manufacturer}/ranged/${SIZE_FOLDERS[entry.sizes[0]] ?? "main"}`;

  return `${manufacturer}/${kind}s`;
}

function folderOf(path) {
  if (!path) return null;
  if (folders.has(path)) return folders.get(path)._id;

  const parts = path.split("/");
  const parent = parts.length > 1 ? folderOf(parts.slice(0, -1).join("/")) : null;
  const folder = { _id: idOf(`folder/${path}`), name: parts.at(-1), type: "Item", folder: parent, description: "", sorting: "a", sort: 0, color: null, flags: {}, _stats: STATS };

  folders.set(path, folder);

  return folder._id;
}

function idOf(text) {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  let id = "";

  for (const letter of text) {
    first = Math.imul(first ^ letter.charCodeAt(0), 16777619) >>> 0;
    second = Math.imul(second + letter.charCodeAt(0), 2246822519) >>> 0;
  }

  for (let count = 0; count < 16; count++) {
    first = Math.imul(first ^ second >>> 7, 2654435761) >>> 0;
    second = Math.imul(second ^ first >>> 13, 1597334677) >>> 0;
    id += LETTERS[((first ^ second) >>> 0) % LETTERS.length];
  }

  return id;
}
