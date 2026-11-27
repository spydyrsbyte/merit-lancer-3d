# MERIT LANCER 3D

3D mechs as tokens in Foundry, for LANCER. Each mech is built from what it has in LANCER: its frame, and its weapons, systems and mods on its mounts. It walks as far as its token moves, turns where the token faces, and acts when LANCER rolls.

It uses **CSG Bash**, a custom CSG kit bashing engine that will be open source first quarter of 2027: [shape-core](../shape-core), [shape-animation](../shape-animation) and the [Shape Workshop](../shape-workshop). The module carries a copy of it in `engine/`, and of the library in `library/`, as Foundry only serves what is in the module's folder. `npm run engine` copies them again.

The old module, merit-mech-workshop, is left as it was. This one has another id on purpose.

## Items

Everything is an item: `merit-lancer-3d.mech`, `.weapon`, `.system` and `.mod`. Each stands for what has the same LANCER id, and has two fields:

- `system.mechdata`: `id` (the LANCER id), `cid` (the compendium item it came from), `csgid` (the shape it shows), `at` (the mount of gear, or nothing to let the mech choose), `meshes` (the finished triangles of each piece), and `needsToken` (see token pictures).
- `system.customization`: shapes by their id, as standard shape JSON. One there is used instead of the shape with the same id anywhere else.

A shape is found in the customization of the actor's items, then in those of the world's items, then in the compendium items they were made from, then in the library of the module.

It is mostly automatic. A mech or NPC gets a mech item for its frame and a gear item for each weapon, system and mod, as soon as one of its tokens is drawn, by the one user who looks after it (an active player who owns it, or else a GM). They follow LANCER: gear which is gone is removed, and a new frame starts over. Of several shapes for one LANCER id, the first which is found is used: an item of the world, then the compendium. A frame with no shape is a GMS Everest, and gear with no shape gets a stand-in, a plain gun or box, as large as its mount.

Meshes are kept on the items, so nothing has to be cut when a mech is loaded. They are made by the engine when an item has none, or none for what it shows now, and written to it. They are made anew when an editor of the item has finished: a save in the workshop, Update, or Back to the original. Newer shapes of the world and the library are only picked up with Update.

The compendium has an item for each LANCER id of each frame, weapon, system and mod of the library, and the two stand-ins: 377 items, in the folders of the library (a manufacturer with its mechs, and melee, ranged by size, systems and mods). Each carries every shape it uses and its meshes, so nothing is fetched or cut when it is used. `npm run pack` builds it from the library, with the database library which comes with Foundry; a world with the module active has to be closed first. Its ids come from the shapes, so items made from it stay linked to it after it is built again.

## The sheet

Every item has two tabs:

- **Detail**: quick changes for whoever plays it. Which shape it shows, the five standard colors, its pose, and for gear its mount. Update, Back to the original, and for a mech opening a token picture someone shared. Colors and poses need no new meshes.
- **Token**: for a mech, how its token picture looks, for whoever does not draw mechs in 3D. A ring of a few styles, its color, a background or clear, and the camera: drag the preview to turn it, scroll to zoom. Outside of the ring the picture is clear. "Use as the token" keeps it all on the mech item (`mechdata.image`), so it can be made again, and writes the token picture. Download gives the picture as it is shown, with the mech in it, to share.
- **Workshop**: the Shape Workshop, with Foundry as its host. Saving puts what was changed into the customization of the item. Its Animation window makes and changes animations, and sets the shape's own (see the Shape Workshop's README); the module's animations are offered there. They are saved in the customization of the item, beside its shapes, and a mech uses the own animations of its frame.

The HUD of a mech token opens the Detail of its mech.

## Tokens

A mech or NPC token is a mech unless its settings say otherwise: below the image is a choice between a mech and a regular token, for a token or for the prototype of an actor.

Every token of a mech has a picture in the world's assets, which is its image, looks like a token (see the Token tab), and holds the mech as well, so players can share their mech:

- `assets/merit-lancer-3d/tokens/<actor id>.png` for linked tokens and the prototype
- `assets/merit-lancer-3d/tokens/unlinked/<token id>.png` for tokens with an actor of their own, so they are easy to clear out

It holds the shape of the loadout, everything in it as it was changed, and the LANCER ids, shapes and mounts of the items, but no meshes. A player who may not upload files marks the mech item with `needsToken`, keeps the picture which was there, and the first GM who is there writes it.

## Animations

`animations/` has the animations of the module, which follow the rules of LANCER (built on mecha, in `engine/shape-core/rules`): idle, a walk, a jump, attacks for fists, blades, hammers and guns, and hit, stagger, down, tech and use, which were made from the old module's.

Attacks are played for the hand which holds the weapon, and the rules choose by what is in it. While the dice are rolled, the attack plays up to its first mark, such as "fire" or "hit", aimed at the first target, and waits there (pauseOn in shape-animation); when the roll is done it goes on, and when it is cancelled it stops. With Lancer Weapon FX, a mech fires when its effect starts, the shot starts at the muzzle of its weapon as it is seen at that moment, and a target which is hit reacts when the effect reaches it. Actions in different places play together, a new one in a busy place replaces what plays there, and one with join `post` waits for it.

## Uniforms

The token controls of a GM have Uniforms: for each standard color, one or more colors to choose from, put on the selected tokens. Each mech gets one at random, so a squad is alike but not the same.

## Settings

Show 3D mechs, quality and motion are for each player. Acting along with LANCER, and turning tokens with locked rotation, are for the world.

## Tests

`npm test` tests what needs no Foundry: the animations against the rules, and putting gear on mounts.
