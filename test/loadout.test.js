import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Library, Shelf } from "../engine/shape-core/src/index.js";
import { EVEREST, STAND_INS } from "../script/items/catalog.js";
import { idOf, Loadout } from "../script/mechs/loadout.js";

const STAND_IN_FILES = { [STAND_INS.weapon]: "stand-ins/weapon.json", [STAND_INS.system]: "stand-ins/system.json" };
const RIFLE = "assault rifle";

const index = JSON.parse(await readFile(new URL("../library/index.json", import.meta.url), "utf8"));
const rifle = index.find(entry => entry.name.toLowerCase() === RIFLE);
const system = index.find(entry => entry.type === "system");

const folder = {
  async read(key) {
    const id = key.split("@")[0];
    const path = STAND_IN_FILES[id] ?? `library/shapes/${id}.json`;

    return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8").catch(() => "null"));
  },
  open: async () => null,
  mesh: () => null
};

async function built(gear) {
  const shelf = new Shelf();
  const library = new Library([shelf, folder]);
  const loadout = new Loadout(library);
  const made = await loadout.shape("Actor.test", "Test", { csgid: EVEREST }, gear);

  shelf.put(JSON.parse(JSON.stringify(made)));

  return { loadout, shape: await library.load(made.id) };
}

test("gear goes on the mounts of the frame, guns in the right hand", async () => {
  const { loadout, shape } = await built([
    { item: "a", csgid: rifle.id, kind: "weapon", size: "Main", weapon: "Rifle", at: "" },
    { item: "b", csgid: system.id, kind: "system", size: "", weapon: "", at: "" }
  ]);

  assert.deepEqual(loadout.notes, []);
  assert.deepEqual(loadout.mounts.map(({ item, at }) => ({ item, at })), [{ item: "a", at: "hand-right" }, { item: "b", at: "mount-back" }]);
  assert.deepEqual(loadout.mounts.map(({ placement }) => placement), shape.parts.slice(1).map(({ id }) => id));
  assert.equal(shape.parts.length, 3);
});

test("a chosen mount is kept, and stand-ins are as large as their weapon", async () => {
  const { loadout, shape } = await built([
    { item: "a", csgid: rifle.id, kind: "weapon", size: "Main", weapon: "Rifle", at: "hand-left" },
    { item: "c", csgid: STAND_INS.weapon, kind: "weapon", size: "Heavy", weapon: "Cannon", at: "" }
  ]);

  assert.equal(loadout.mounts.find(({ item }) => item === "a").at, "hand-left");
  assert.equal(loadout.mounts.length, 2);
  assert.deepEqual(shape.parts.find(part => part.use === STAND_INS.weapon).size, [1.3, 1.3, 1.3]);
});

test("a mech has the frame's own animations", async () => {
  const shelf = new Shelf();
  const own = { ...JSON.parse(await readFile(new URL(`../library/shapes/${EVEREST}.json`, import.meta.url), "utf8")), id: "own-everest", animations: { walk: "heavy-walk" } };
  const library = new Library([shelf, folder]);

  shelf.put(own);

  const made = await new Loadout(library).shape("Actor.test", "Test", { csgid: "own-everest" }, []);

  assert.deepEqual(made.animations, { walk: "heavy-walk" });
});

test("ids come from the actor, so they are the same every time", () => {
  assert.equal(idOf("Actor.x", "loadout"), idOf("Actor.x", "loadout"));
  assert.notEqual(idOf("Actor.x", "loadout"), idOf("Actor.y", "loadout"));
  for (const key of ["Actor.x", "Actor.test/frame", "Actor.test/loadout", "A/frame"]) {
    assert.match(idOf(key), /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }
});
