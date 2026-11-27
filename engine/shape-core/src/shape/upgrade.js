/*
  Brings the JSON of a shape in an older version up to this one.

  In version 1 a box had a "material", and every other shape had "paint". Since then
  a box is painted like any other, and its one material is called primary.
*/

import { list, record, text } from "../input/clean.js";
import { BUILTINS } from "../solid/builtin.js";

export function upgraded(json, { major }) {
  const version = record(json.version).major ?? major;

  if (version >= 2 || !json.shapes) return json;

  return { ...json, shapes: list(json.shapes).map(record).map(painted) };
}

function painted({ material, ...placement }) {
  const name = text(material, "primary");

  if (!BUILTINS.has(placement.use) || name === "primary") return placement;

  return { ...placement, paint: { primary: name } };
}
