/*
  The Paints of the current shape: its materials, and what is painted with them.

  A placed shape has slots, which are the materials it was made with. Each can be
  swapped for one of the shape it is in. A box has one slot, primary.
*/

import { isStandard, Material, standard, STANDARD_NAMES } from "../../../shape-core/src/index.js";
import { freeName } from "./names.js";

export class Paints {
  #workshop;

  constructor(workshop) {
    this.#workshop = workshop;
  }

  get surroundings() {
    const { surroundings, json } = this.#draft;
    const others = Object.entries(surroundings).filter(([name]) => !Object.hasOwn(json.materials, name));

    return Object.fromEntries(others);
  }

  get materials() {
    const { materials } = this.#draft.json;
    const { figure } = this.#workshop.view;
    const own = Object.keys(materials).filter(name => !isStandard(name));

    return [
      ...STANDARD_NAMES.map(name => [name, figure.material(name)]),
      ...own.map(name => [name, new Material(materials[name])])
    ];
  }

  has(name) {
    return this.materials.some(([one]) => one === name);
  }

  slotsOf(id) {
    const { shape } = this.#draft.thing(id);

    const limbs = shape.limbs.flatMap(({ chain }) => {
      return chain.at(-1).shape.mesh.slots.map(slot => chain.reduceRight((name, placement) => placement.materialOf(name), slot));
    });

    return [...new Set([...shape.mesh.slots, ...limbs])];
  }

  slotName(id, slot) {
    if (isStandard(slot)) return standard(slot, {}).name;

    return this.#foreign(this.#draft.thing(id).shape, slot)?.name ?? slot;
  }

  slotMaterial(id, slot) {
    const thing = this.#draft.thing(id);
    const chosen = thing.materialOf(slot);
    const own = this.materials.find(([name]) => name === chosen)?.[1];

    return own ?? new Material(this.#foreign(thing.shape, slot) ?? {});
  }

  paint(id, slot, name) {
    const { [slot]: old, ...paint } = this.#draft.get(id).value.paint ?? {};
    const changed = name ? { ...paint, [slot]: name } : paint;

    this.#workshop.set(id, { paint: filled(changed) });
  }

  apply(name, isAll) {
    const { ids } = this.#workshop.selection;

    this.#workshop.edit(draft => {
      for (const id of isAll ? draft.subtree(...ids) : ids) {
        if (draft.get(id).kind !== "shape") continue;

        const swaps = this.slotsOf(id).filter(slot => slot !== name).map(slot => [slot, name]);

        draft.update(id, { paint: filled(Object.fromEntries(swaps)) });
      }
    });
  }

  live(name, material) {
    const draft = this.#draft;

    draft.begin();
    draft.json.materials = { ...draft.json.materials, [name]: material };
    draft.refresh();
    this.#workshop.showFigure();
  }

  add(material) {
    const name = freeName("material", new Set(this.materials.map(([slug]) => slug)));

    this.#workshop.setShape({ materials: { ...this.#draft.json.materials, [name]: { ...material, name: `${material.name} copy` } } });

    return name;
  }

  remove(name) {
    this.#workshop.edit(({ json }) => {
      const { [name]: gone, ...materials } = json.materials;

      json.materials = materials;

      if (!isStandard(name)) unpaint(json.shapes ?? [], name);
    });
  }

  get #draft() {
    return this.#workshop.draft;
  }

  #foreign(shape, slot) {
    const [owner, own] = slot.includes(":") ? slot.split(":") : ["", slot];
    const holder = owner ? this.#workshop.session.library.find(owner) : shape;

    return holder?.materials?.[own] ?? null;
  }
}

function unpaint(placements, name) {
  for (const { paint = {} } of placements) {
    for (const slot of Object.keys(paint)) if (paint[slot] === name) delete paint[slot];
  }
}

function filled(paint) {
  return Object.keys(paint).length ? paint : undefined;
}
