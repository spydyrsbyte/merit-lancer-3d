/*
  Copies CSG Bash, the engine, into the module, and the library with it. Foundry only
  serves what is in the folder of a module, so the module carries its own copy.

  The ids of the shapes in the library are listed in library/shapes.json, so the module
  only asks for what is there.

  The folders keep the names and the order they have beside the module, so the engine
  finds its own parts the same way in both places.

    node tools/engine.js
*/

import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = join(MODULE, "..");

const COPIES = [
  ["shape-core/src", "engine/shape-core/src"],
  ["shape-core/rules", "engine/shape-core/rules"],
  ["shape-animation/src", "engine/shape-animation/src"],
  ["shape-workshop/src", "engine/shape-workshop/src"],
  ["shape-library/index.json", "library/index.json"],
  ["shape-library/shapes", "library/shapes"]
];

for (const [from, to] of COPIES) {
  const source = join(PROJECTS, from);
  const target = join(MODULE, to);

  if (!existsSync(source)) throw new Error(`${source} is not there`);

  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });

  console.log(`${from} -> ${to}`);
}

const ids = readdirSync(join(MODULE, "library/shapes")).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5));

writeFileSync(join(MODULE, "library/shapes.json"), JSON.stringify(ids));
console.log(`${ids.length} shapes listed`);
