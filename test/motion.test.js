import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Motion } from "../script/mechs/motion.js";

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("every animation of the module fits the rules of LANCER", async () => {
  const motion = await Motion.load(read);

  assert.deepEqual(motion.notes, []);
  assert.equal(motion.files.length, 14);

  for (const slot of ["idle", "walk", "attack", "hit", "down", "tech", "use", "stagger"]) {
    assert.ok(motion.files.some(json => json.plays === slot), slot);
  }
});
