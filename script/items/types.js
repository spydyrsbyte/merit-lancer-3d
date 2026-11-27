/*
  The items of the module: a mech, and its weapons, systems and mods. Each stands for
  what has the same LANCER id, and holds what it looks like.

  mechdata
    id          the LANCER id (lid)
    cid         the compendium item it was made from, if any
    csgid       the id of the shape it shows. That shape is found in its customization,
                then in the items of the world, then in the compendium
    at          the mount it is on, for gear; nothing lets the mech choose
    meshes      the finished triangles of each piece, so nothing has to be cut on load:
                { shape, stamp, joint, data }, where data is the mesh, deflated, in Base64
    needsToken  the token picture could not be saved by whoever changed it, and waits
                for a GM
    place       for gear: how it sits on its mount, as the Mech Designer sets it: size,
                turn, tilt and roll, flip, which colors of the mech its own colors are
                (paint), and off, whether it is taken off the mech
    insignia    for a mech: what is at each of its insignia locations
    image       how its token picture looks: the style and color of its ring, the
                background inside of it (nothing is clear), and the camera: heading,
                tilt and zoom (see tokens/token-image.js)

  Gear which the Designer put on by hand, and which LANCER does not have, is marked
  with the flag byHand, so it is kept when the items follow LANCER.

  customization holds shapes by their id, as standard shape JSON. One there is used
  instead of the shape with the same id anywhere else.

  LANCER sends every update of an item through full_update_data, to merge lists of
  its own. Items of the module have none.
*/

import { ID, TYPES, typeOf } from "../module.js";
import { ItemSheet3D } from "../sheets/item-sheet.js";

const { ArrayField, BooleanField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

const ICONS = { mech: "fa-solid fa-robot", weapon: "fa-solid fa-gun", system: "fa-solid fa-microchip", mod: "fa-solid fa-screwdriver-wrench" };

class MechData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      mechdata: new SchemaField({
        id: new StringField({ blank: true, initial: "" }),
        cid: new StringField({ blank: true, initial: "" }),
        csgid: new StringField({ blank: true, initial: "" }),
        at: new StringField({ blank: true, initial: "" }),
        meshes: new ArrayField(new ObjectField()),
        needsToken: new BooleanField({ initial: false }),
        place: new ObjectField(),
        insignia: new ObjectField(),
        image: new SchemaField({
          ring: new StringField({ blank: false, initial: "plain" }),
          color: new StringField({ blank: true, initial: "#c8d0d8" }),
          background: new StringField({ blank: true, initial: "" }),
          heading: new NumberField({ initial: 150 }),
          tilt: new NumberField({ initial: 40, min: 0, max: 90 }),
          zoom: new NumberField({ initial: 1, min: 0.25, max: 4 })
        })
      }),
      customization: new ObjectField()
    };
  }

  full_update_data(changes) {
    return changes;
  }
}

export function registerItems() {
  for (const kind of TYPES) {
    CONFIG.Item.dataModels[typeOf(kind)] = MechData;
    CONFIG.Item.typeIcons[typeOf(kind)] = ICONS[kind];
  }

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, ID, ItemSheet3D, {
    types: TYPES.map(typeOf), makeDefault: true, label: "MERIT3D.Sheet.Label"
  });
}
