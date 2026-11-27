/*
  The Mech Designer: where players make a mech their own. It is the Designer of
  merit-mech-workshop on the new engine, with the same tabs, and works the same way:

    Frame     choose a variant of the actor's LANCER frame.
              What is equipped, painted and marked comes along where it fits.
    Equip     drag something onto the mech, or click it to put it in its usual place.
              Drag it off the mech to take it off. Dropped on a part which is on the
              mech, or on its row, it is used in that part's place: the part keeps its
              name, its LANCER item and its mount, and looks like what was dropped. The
              card has the same as "Looks like". The gear on the sheet comes first,
              each with the parts which stand for it, and any other part can be used.
              What is on the mech can be chosen, and sized, turned, flipped,
              straightened, given the mech's colors, or taken off.
    Paint     color schemes, and every color of the mech: its colors and finish, each
              back to the color of the frame. Clicking the mech finds a color.
    Insignia  for each location of the frame, an emblem, a text or an image. They are
              kept and projected onto the frame as decals.
    Pose      how the mech stands.

  Under it are undo and redo, back to the frame's look (its colors, without insignia;
  what is equipped stays), whether it is saved, and Save; and two the new module needs:
  Update, which makes the meshes anew, and opening a token picture someone shared. Nothing changes until it is
  saved; while it is not, the tokens of the mech show it as it is here, for this user.

  It only knows the mech and what is on it. Shapes are for the workshop.

  See design.js for what is changed and how it is saved.
*/

import { Decals, DecalPicture, importSvg, isStandard, STANDARD_NAMES, standard } from "../../engine/shape-core/src/index.js";
import { bendable } from "../../engine/shape-workshop/src/view/bender.js";
import { View, VIEWS } from "../../engine/shape-workshop/src/view/view.js";
import { tokenMechs } from "../canvas/token-mechs.js";
import { kindFor, loadIndex } from "../items/catalog.js";
import { Finder } from "../items/finder.js";
import { frameOf, gearOf } from "../lancer/gear.js";
import { gearItemsOf, mechItemOf } from "../mechs/assembly.js";
import { mountsFor } from "../mechs/loadout.js";
import { kindOf, say } from "../module.js";
import { openPicture, rebuild } from "../sheets/detail.js";
import { el } from "../sheets/dom.js";
import { Design } from "./design.js";
import { folderList, folderOf } from "./folders.js";
import { cleanInsignia, EMBLEMS, emblemPicture, KINDS, LOCATIONS } from "./insignia.js";
import { drawPortraits } from "./portraits.js";
import { colorsFor, PATTERN_COLORS, SCHEME_NAMES, SCHEMES } from "./schemes.js";

const TABS = { frame: "fa-robot", equip: "fa-gun", paint: "fa-palette", insignia: "fa-shield-halved", pose: "fa-person-rays" };
const SHOWN_VIEWS = ["angled", "front", "side", "top"];
const REACH = 60;
const DRAG = 5;
const PATTERNS = Object.keys(PATTERN_COLORS);
const TURNS = ["turn", "tilt", "roll"];
const LIMITS = { turn: 180, tilt: 90, roll: 180 };
const MOST = 200;

export class MechDesigner {
  #item;
  #actor;
  #design = null;
  #preview = null;
  #view = null;
  #tab = "equip";
  #history = [];
  #future = [];
  #pending = null;
  #saved = "";
  #entry = null;
  #decalChoices = [];
  #location = null;
  #painted = null;
  #drag = null;
  #folders = new Map();
  #building = null;
  #again = false;
  #panel;
  #footer;
  #stage;
  #points;

  constructor(item) {
    this.#item = item;
    this.#actor = item.parent;
    this.#stage = el("div", { className: "stage" });
    this.#points = el("div", { className: "points" });
    this.#panel = el("section", { className: "panel" });
    this.#footer = el("footer", { className: "footer" });

    const views = SHOWN_VIEWS.map(name => el("button", { type: "button", textContent: say(`Designer.View.${name}`), onclick: () => this.#view?.look(name) }));

    this.element = el("div", {
      className: "merit3d-designer",
      tabIndex: -1,
      onkeydown: event => this.#key(event),
      oninput: event => this.#input(event),
      onchange: event => this.#changed(event),
      onpointerdown: event => this.#pressTile(event)
    },
    el("section", { className: "viewport shape-workshop" }, this.#stage, this.#points, el("div", { className: "views" }, ...views)),
    this.#panel,
    this.#footer);
  }

  get isDirty() {
    return Boolean(this.#design) && this.#snapshot() !== this.#saved;
  }

  async load() {
    if (!this.#actor || !mechItemOf(this.#actor)) {
      this.element.replaceChildren(el("p", { className: "hint", textContent: say("Designer.NoMech") }));

      return;
    }

    this.#design = await Design.read(this.#actor);
    this.#saved = this.#snapshot();
    this.#view = new View(this.#stage, {
      click: (at, event) => this.#clickMech(at, event),
      grab: (at, event) => this.#grabMech(at, event),
      draw: () => null
    });

    await this.#rebuild();
    this.#view.look(VIEWS.angled ? "angled" : SHOWN_VIEWS[0]);
    this.#render();
  }

  close() {
    this.#stopDrag();
    tokenMechs.setPreview(this.#actor, null);
    this.#view?.close();
    this.#view = null;
  }

  async save() {
    this.#endEdit();

    try {
      await this.#design.save();
    } catch (error) {
      ui.notifications.error(say("Designer.SaveFailed", { error: error.message }));

      return false;
    }

    tokenMechs.setPreview(this.#actor, null);
    this.#design = await Design.read(this.#actor);
    this.#saved = this.#snapshot();
    this.#history = [];
    this.#future = [];
    await this.#rebuild();
    this.#render();
    ui.notifications.info(say("Designer.Saved", { name: this.#actor.name }));

    return true;
  }

  #snapshot() {
    return this.#design.state;
  }

  async #openPicture() {
    await openPicture(this.#item);
    this.#design = await Design.read(this.#actor);
    this.#saved = this.#snapshot();
    this.#history = [];
    this.#future = [];
    await this.#rebuild();
    this.#render();
  }

  #render() {
    const panel = this.#panelContent();

    this.#panel.replaceChildren(
      el("nav", { className: "designer-tabs" }, ...Object.entries(TABS).map(([key, icon]) => el("button", {
        type: "button",
        "aria-pressed": key === this.#tab ? "true" : "false",
        onclick: () => this.#chooseTab(key)
      }, el("i", { className: `fa-solid ${icon}`, inert: true }), el("span", { textContent: say(`Designer.Tab.${key}`) })))),
      el("div", { className: "choices-list" }, ...panel));

    this.#footer.replaceChildren(...this.#footerContent());
    drawPortraits(this.#panel);
    this.#panel.querySelector(".material.painted")?.scrollIntoView({ block: "nearest" });
  }

  #chooseTab(tab) {
    this.#endEdit();
    this.#tab = tab;
    this.#render();
  }

  #panelContent() {
    if (this.#tab === "frame") return this.#frameTab();
    if (this.#tab === "equip") return this.#equipTab();
    if (this.#tab === "paint") return this.#paintTab();
    if (this.#tab === "insignia") return this.#insigniaTab();

    return this.#poseTab();
  }

  #footerContent() {
    const dirty = this.isDirty;

    return [
      el("button", { type: "button", className: "icon fa-solid fa-rotate-left", title: say("Designer.Undo"), disabled: !this.#history.length, onclick: () => this.#undo() }),
      el("button", { type: "button", className: "icon fa-solid fa-rotate-right", title: say("Designer.Redo"), disabled: !this.#future.length, onclick: () => this.#redo() }),
      el("button", { type: "button", title: say("Designer.ResetLookHint"), onclick: () => this.#resetLook() }, el("i", { className: "fa-solid fa-brush", inert: true }), ` ${say("Designer.ResetLook")}`),
      el("span", { className: `status${dirty ? " dirty" : ""}`, textContent: say(dirty ? "Designer.Unsaved" : "Designer.SavedStatus") }),
      el("button", { type: "button", className: "icon fa-solid fa-rotate", title: say("Detail.UpdateHint"), disabled: !this.#item.isOwner, onclick: () => rebuild(this.#item) }),
      el("button", { type: "button", className: "icon fa-solid fa-file-import", title: say("Detail.OpenPicture"), disabled: !this.#item.isOwner, onclick: () => this.#openPicture() }),
      el("button", { type: "button", className: "save", disabled: !this.#item.isOwner, onclick: () => this.save() }, el("i", { className: "fa-solid fa-floppy-disk", inert: true }), ` ${say("Designer.Save")}`)
    ];
  }

  #frameTab() {
    const frames = this.#frames.map(entry => ({ ...entry, own: true, selected: entry.csgid === this.#design.csgid }));

    return [
      el("p", { className: "lead", textContent: say("Designer.FrameHint") }),
      frames.length ? el("div", { className: "tiles large" }, ...frames.map(frame => this.#frameTile(frame))) : el("p", { className: "hint", textContent: say("Designer.NoFrameVariants") })
    ];
  }

  get #frames() {
    const lid = frameOf(this.#actor)?.system?.lid;

    if (!lid) return [];

    const known = new Set();

    return this.#entries.filter(entry => {
      if (entry.kind !== "mech" || !entry.lids.includes(lid) || !entry.csgid || known.has(entry.csgid)) return false;

      known.add(entry.csgid);

      return true;
    });
  }

  #frameTile(frame) {
    return el("button", { type: "button", className: "tile", "aria-pressed": frame.selected ? "true" : "false", onclick: () => this.#chooseFrame(frame) },
      el("img", { alt: "", "data-portrait": frame.csgid }),
      el("span", { textContent: frame.name }),
      frame.own ? el("small", { textContent: say("Designer.YourFrame") }) : null);
  }

  #folder(key, path, usually, content) {
    const details = el("details", { open: this.#folders.get(key) ?? usually }, el("summary", { textContent: path || say("Designer.NoFolder") }, el("small", { textContent: ` ${content.children.length}` })), content);

    details.addEventListener("toggle", () => this.#folders.set(key, details.open));

    return details;
  }

  async #chooseFrame(frame) {
    if (frame.csgid === this.#design.csgid || !this.#frames.some(entry => entry.csgid === frame.csgid && entry.cid === frame.cid)) return;

    const before = this.#design.frame;
    const next = await new Finder([]).read(frame.csgid);

    if (!next) return;

    this.#edit(design => {
      const carried = structuredClone(next);

      for (const name of STANDARD_NAMES) {
        const changed = JSON.stringify(before.materials?.[name]) !== JSON.stringify(design.base.materials?.[name]);

        if (changed && before.materials?.[name]) carried.materials = { ...carried.materials, [name]: structuredClone(before.materials[name]) };
      }

      design.csgid = frame.csgid;
      design.cid = frame.cid ?? "";
      design.base = structuredClone(next);
      design.frame = carried;
    });

    this.#view?.fit();
  }

  get #entries() {
    return this.#catalog ?? [];
  }

  #catalog = null;

  async #loadCatalog() {
    const index = await loadIndex();
    const world = game.items.filter(item => kindOf(item)).map(item => ({
      name: item.name, csgid: item.system.mechdata.csgid, cid: item.uuid, kind: kindOf(item) === "mech" ? "mech" : "part",
      type: kindOf(item), lids: [item.system.mechdata.id], sizes: [], weapon: "", folder: item.folder?.name ?? ""
    }));
    const listed = index.map(entry => ({ name: entry.name, csgid: entry.id, cid: "", kind: entry.kind, type: entry.type, lids: entry.lids, sizes: entry.sizes ?? [], weapon: entry.weapon ?? "", folder: folderOf(entry) }));

    this.#catalog = [...world, ...listed];
  }

  #equipTab() {
    const { preview } = this;
    const shown = this.#design.shown;
    const sheet = gearOf(this.#actor).filter(gear => gear.lid);
    const parts = this.#entries.filter(entry => entry.kind !== "mech");
    const onMech = new Set(shown.map(one => one.csgid));
    const linked = new Set();

    const gear = sheet.map(one => {
      const tiles = parts.filter(entry => entry.lids.includes(one.lid));

      for (const tile of tiles) linked.add(tile.csgid);

      return { ...one, name: one.name || tiles[0]?.name || one.lid, tiles };
    });

    const others = parts.filter(entry => !linked.has(entry.csgid));
    const without = gear.filter(one => !one.tiles.length).map(one => one.name);
    const selected = this.#design.find(this.#entry);
    const mountOf = one => preview?.mounts.find(mount => mount.item === one.key)?.at ?? "";

    return [
      el("p", { className: "lead", textContent: say(preview?.frame?.skeleton.sockets.length ? "Designer.EquipHint" : "Designer.NoPoints") }),
      shown.length ? el("h3", { textContent: say("Designer.OnMech") }) : null,
      shown.length ? el("ul", { className: "rows" }, ...shown.map(one => el("li", {}, el("button", {
        type: "button", "aria-pressed": one.key === this.#entry ? "true" : "false", "data-gear": one.key,
        onclick: () => this.#pickEntry(one.key)
      }, el("span", { textContent: one.name }), el("small", { textContent: plainMount(mountOf(one)) }))))) : null,
      selected ? this.#entryCard(selected) : null,
      gear.some(one => one.tiles.length) ? el("h3", { textContent: say("Designer.FromSheet") }) : null,
      ...gear.filter(one => one.tiles.length).map(one => el("div", { className: "gear" },
        el("div", { className: "gear-name" }, el("strong", { textContent: one.name }), el("small", { textContent: [one.size, say(`Designer.Kind.${one.kind}`)].filter(Boolean).join(" ") })),
        el("div", { className: "tiles" }, ...one.tiles.map(tile => this.#partTile(tile, onMech.has(tile.csgid), one.lid))))),
      without.length ? el("p", { className: "lead", textContent: say("Designer.NoPart", { names: without.join(", ") }) }) : null,
      ...folderList(others).map(({ path, entries }) => this.#folder(`part:${path}`, path, !path, el("div", { className: "tiles" }, ...entries.map(tile => this.#partTile(tile, onMech.has(tile.csgid), "")))))
    ];
  }

  #partTile(tile, isOn, sheetLid) {
    const sizes = (tile.sizes ?? []).join(", ");

    return el("div", { className: "tile part", tabIndex: 0, "data-part": tile.csgid, "data-sheet": sheetLid, ...isOn ? { "data-on": "" } : {} },
      el("img", { alt: "", draggable: false, "data-portrait": tile.csgid }),
      el("span", { textContent: tile.name }),
      sizes ? el("small", { textContent: sizes }) : null);
  }

  #lookChoice(one) {
    const own = one.kind;
    const melee = this.#gearFor({ key: one.key }).weapon === "Melee";
    const parts = this.#entries.filter(entry => entry.kind !== "mech" && kindFor(entry) === own);
    const ranked = [...parts.filter(entry => (entry.weapon === "Melee") === melee), ...parts.filter(entry => (entry.weapon === "Melee") !== melee)];
    const current = ranked.some(entry => entry.csgid === one.csgid) ? [] : [{ value: one.csgid, label: say("Designer.StandIn") }];
    const options = [...current, ...ranked.map(entry => ({ value: entry.csgid, label: entry.name }))];

    return el("label", { className: "field" }, el("span", { textContent: say("Designer.LooksLike") }),
      el("select", { onchange: event => this.#useLook(one.key, event.target.value) },
        ...options.map(option => el("option", { value: option.value, textContent: option.label, selected: option.value === one.csgid }))));
  }

  #useLook(key, csgid) {
    this.#edit(design => {
      const one = design.find(key);

      if (one) one.csgid = csgid;
    });
  }

  #gearUnder(event) {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-gear]");

    if (row) return row.dataset.gear;
    if (!this.#isOverMech(event) || !this.#view) return null;

    const box = this.#stage.getBoundingClientRect();
    const ratio = this.#view.ratio;

    return this.#gearAt(this.#view.pick([(event.clientX - box.left) * ratio, (event.clientY - box.top) * ratio]))?.key ?? null;
  }

  #entryCard(one) {
    const place = one.place ?? {};
    const slots = this.#slotsOf(one);

    return el("div", { className: "card" },
      el("h4", { textContent: one.name }),
      this.#lookChoice(one),
      el("label", { className: "field" }, el("span", { textContent: say("Designer.Size") }), el("input", { type: "range", min: 0.4, max: 2, step: 0.05, value: place.size ?? 1, "data-field": "size" })),
      ...TURNS.map(turn => el("label", { className: "field" }, el("span", { textContent: say(`Designer.Turn.${turn}`) }),
        el("input", { type: "range", min: -LIMITS[turn], max: LIMITS[turn], step: 5, value: place[turn] ?? 0, "data-field": "turn", "data-turn": turn }))),
      ...slots,
      el("div", { className: "buttons" },
        el("button", { type: "button", "aria-pressed": place.flip ? "true" : "false", onclick: () => this.#edit(design => {
          const found = design.find(one.key);

          found.place = { ...found.place, flip: !found.place?.flip };
        }) }, el("i", { className: "fa-solid fa-left-right", inert: true }), ` ${say("Designer.Flip")}`),
        el("button", { type: "button", onclick: () => this.#edit(design => {
          const found = design.find(one.key);

          found.place = { ...found.place, turn: 0, tilt: 0, roll: 0 };
        }) }, el("i", { className: "fa-solid fa-arrows-to-dot", inert: true }), ` ${say("Designer.Straighten")}`),
        el("button", { type: "button", onclick: () => this.#takeOff(one.key) }, el("i", { className: "fa-solid fa-xmark", inert: true }), ` ${say("Designer.TakeOff")}`)));
  }

  #slotsOf(one) {
    const shape = this.#preview?.library.find(one.csgid);

    if (!shape) return [];

    const own = Object.keys(shape.materials ?? {});
    const used = [...new Set([...STANDARD_NAMES.filter(name => shapeUses(shape, name)), ...own])];
    const mech = this.#mechMaterials();

    return used.map(slot => {
      const chosen = one.place?.paint?.[slot] ?? "";
      const isShared = isStandard(slot);
      const name = isShared ? this.#materialOf(slot).name : shape.materials[slot]?.name ?? slot;
      const options = [
        { value: "", label: say(isShared ? "Designer.Same" : "Designer.Own", { name }) },
        ...mech.map(({ key, name: label }) => ({ value: key, label }))
      ];

      return el("label", { className: "row" },
        el("i", { className: "swatch", style: swatchStyle(chosen ? this.#materialOf(chosen) : isShared ? this.#materialOf(slot) : standard("primary", shape.materials[slot] ?? {})) }),
        el("span", { textContent: name }),
        el("select", { "data-field": "slot", "data-own": slot }, ...options.map(option => el("option", { value: option.value, textContent: option.label, selected: option.value === chosen }))));
    });
  }

  #paintTab() {
    const rows = this.#mechMaterials().filter(({ isUsed }) => isUsed);
    const main = rows.filter(({ key }) => isStandard(key));
    const more = rows.filter(({ key }) => !isStandard(key));
    const isMoreOpen = Boolean(this.#painted) && !isStandard(this.#painted);

    return [
      el("p", { className: "lead", textContent: say("Designer.PaintHint") }),
      el("h3", { textContent: say("Designer.Schemes") }),
      el("div", { className: "schemes" }, ...Object.entries(SCHEMES).map(([key, colors]) => el("button", {
        type: "button", title: say(`Designer.Scheme.${key}`), "aria-label": say(`Designer.Scheme.${key}`), onclick: () => this.#scheme(colors)
      }, ...colors.map(color => el("i", { style: `background: ${color}` }))))),
      el("h3", { textContent: say("Designer.Colors") }),
      ...main.map(row => this.#paintRow(row)),
      more.length ? el("details", { open: isMoreOpen }, el("summary", { textContent: say("Designer.MoreColors") }), ...more.map(row => this.#paintRow(row))) : null
    ];
  }

  #paintRow({ key, material }) {
    const count = PATTERN_COLORS[material.pattern] ?? 1;
    const base = this.#design.base.materials?.[key];
    const canReset = JSON.stringify(base ?? null) !== JSON.stringify(this.#design.frame.materials?.[key] ?? null);

    return el("div", { className: `material${key === this.#painted ? " painted" : ""}`, "data-material": key },
      el("i", { className: "swatch", style: swatchStyle(material) }),
      el("span", { className: "name", textContent: material.name }),
      ...material.colors.slice(0, count).map((color, index) => el("input", {
        type: "color", value: color, "data-field": "color", "data-index": index,
        title: index ? say("Designer.ColorNumber", { number: index + 1 }) : say("Designer.Color")
      })),
      el("select", { "data-field": "pattern", title: say("Designer.Finish") }, ...PATTERNS.map(pattern => el("option", { value: pattern, textContent: say(`Designer.Pattern.${pattern}`), selected: pattern === material.pattern }))),
      el("button", { type: "button", className: "icon fa-solid fa-rotate-left", title: say("Designer.ResetPaint"), disabled: !canReset, onclick: () => this.#resetPaint(key) }));
  }

  #insigniaTab() {
    const locations = this.#locations;

    if (!locations.includes(this.#location)) this.#location = locations[0] ?? null;
    if (!locations.length) return [el("p", { className: "lead", textContent: say("Designer.NoLocations") })];

    const own = this.#design.insignia;
    const now = own[this.#location] ?? null;
    const kind = now?.kind ?? "none";

    return [
      el("p", { className: "lead", textContent: say("Designer.InsigniaHint") }),
      el("p", { className: "lead", textContent: say("Designer.InsigniaHelp") }),
      el("div", { className: "locations" }, ...locations.map(key => el("button", {
        type: "button", "aria-pressed": key === this.#location ? "true" : "false", onclick: () => {
          this.#location = key;
          this.#render();
        }
      }, el("i", { className: `fa-solid ${own[key] ? "fa-circle-check" : "fa-circle"}`, inert: true }), ` ${say(`Designer.Location.${key}`)}`))),
      el("div", { className: "card" },
        el("h4", { textContent: say(`Designer.Location.${this.#location}`) }),
        el("label", { className: "field" }, el("span", { textContent: say("Designer.Insignia.Shows") }),
          el("select", { "data-field": "insignia.kind" }, ...["none", ...KINDS].map(one => el("option", { value: one, textContent: say(`Designer.Insignia.Kind.${one}`), selected: one === kind })))),
        ...now ? this.#insigniaFields(now) : [])
    ];
  }

  #insigniaFields(insignia) {
    const fonts = Object.keys(foundry.applications.settings.menus.FontConfig.getAvailableFontChoices());
    const hasColor = insignia.kind !== "image" || insignia.recolor;

    return [
      el("button", { type: "button", onclick: () => this.#openDecals() }, "Open decal file"),
      this.#decalChoices.length ? el("select", { onchange: event => this.#edit(() => this.#setInsignia({ kind: "emblem", decal: this.#decalChoices[Number(event.target.value)] })) }, el("option", { textContent: "Choose imported insignia", value: "", disabled: true, selected: true }), ...this.#decalChoices.map((one, index) => el("option", { value: index, textContent: one.name }))) : null,
      insignia.decal ? el("p", { textContent: insignia.decal.name }) : null,
      insignia.kind === "emblem" ? el("div", { className: "emblems" }, ...EMBLEMS.map(emblem => el("button", {
        type: "button", "aria-pressed": !insignia.decal && emblem === insignia.emblem ? "true" : "false", title: say(`Designer.Emblem.${emblem}`),
        onclick: () => this.#edit(() => this.#setInsignia({ emblem, decal: undefined }))
      }, el("img", { src: emblemPicture(emblem), alt: "" })))) : null,
      insignia.kind === "text" ? el("label", { className: "field" }, el("span", { textContent: say("Designer.Insignia.Text") }), el("input", { type: "text", value: insignia.text, maxLength: 24, placeholder: "00", "data-field": "insignia.text" })) : null,
      insignia.kind === "text" ? el("label", { className: "field" }, el("span", { textContent: say("Designer.Insignia.Font") }),
        el("select", { "data-field": "insignia.font" }, el("option", { value: "", textContent: "–" }), ...fonts.map(font => el("option", { value: font, textContent: font, selected: font === insignia.font })))) : null,
      insignia.kind === "image" ? el("div", { className: "row" }, el("input", { type: "text", value: insignia.src, maxLength: 500, "data-field": "insignia.src" }),
        el("button", { type: "button", onclick: () => this.#browseImage() }, el("i", { className: "fa-solid fa-file-image", inert: true }), ` ${say("Designer.Insignia.Browse")}`)) : null,
      insignia.kind === "image" ? el("label", { className: "row" }, el("input", { type: "checkbox", checked: insignia.recolor, "data-field": "insignia.recolor" }), el("span", { textContent: say("Designer.Insignia.Recolor") })) : null,
      hasColor ? el("label", { className: "row" }, el("input", { type: "color", value: insignia.color, "data-field": "insignia.color" }), el("span", { textContent: say("Designer.Insignia.Color") })) : null,
      el("label", { className: "field" }, el("span", { textContent: say("Designer.Insignia.Opacity") }), el("input", { type: "range", min: 0.05, max: 1, step: 0.05, value: insignia.opacity, "data-field": "insignia.opacity" })),
      el("label", { className: "field" }, el("span", { textContent: say("Designer.Insignia.Wear") }), el("input", { type: "range", min: 0, max: 1, step: 0.05, value: insignia.wear, "data-field": "insignia.wear" })),
      el("label", { className: "row" }, el("input", { type: "checkbox", checked: insignia.glow, "data-field": "insignia.glow" }), el("span", { textContent: say("Designer.Insignia.Glow") }))
    ];
  }

  get #locations() {
    const shape = this.#preview?.shape;
    const names = new Set(shape ? [...shape.everything].flatMap(one => one.decals?.map(place => place.name) ?? []) : []);

    return LOCATIONS.filter(location => names.has(location));
  }

  #setInsignia(changes) {
    const { insignia } = this.#design;

    if (changes.kind === "none") delete insignia[this.#location];
    else if (this.#location) insignia[this.#location] = cleanInsignia({ ...insignia[this.#location], ...changes });
  }

  #openDecals() {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".svg,.json,.png";
    input.onchange = async () => {
      const file = input.files[0];

      if (!file) return;

      try {
        if (/\.svg$/i.test(file.name)) {
          const result = importSvg(await file.text(), file.name.replace(/\.svg$/i, ""));

          this.#decalChoices = [result.decal];
          if (result.dropped.length) ui.notifications.warn("SVG import dropped: " + result.dropped.join(", "));
        } else if (/\.png$/i.test(file.name)) {
          const picture = await DecalPicture.read(new Uint8Array(await file.arrayBuffer()));

          if (!picture) throw new Error("This picture does not contain decals");

          this.#decalChoices = picture.collection.decals;
        } else this.#decalChoices = new Decals(JSON.parse(await file.text())).decals;

        this.#render();
      } catch (error) {
        ui.notifications.error(error.message);
      }
    };
    input.click();
  }

  #browseImage() {
    const location = this.#location;
    const picker = foundry.applications.apps.FilePicker.implementation;

    new picker({
      type: "image",
      current: this.#design.insignia[location]?.src ?? "",
      callback: src => {
        if (this.#location === location) this.#edit(() => this.#setInsignia({ src }));
      }
    }).render({ force: true });
  }

  #poseTab() {
    const { poses = {}, pose = "" } = this.#design.frame;
    const rows = [{ slug: "", name: say("Designer.AsBuilt") }, ...Object.entries(poses).map(([slug, one]) => ({ slug, name: one.name ?? slug }))];
    const chosen = poses[pose] ? pose : "";

    return [
      el("p", { className: "lead", textContent: say("Designer.PoseHint") }),
      el("ul", { className: "rows" }, ...rows.map(({ slug, name }) => el("li", {}, el("button", {
        type: "button", "aria-pressed": slug === chosen ? "true" : "false",
        onclick: () => this.#edit(design => {
          design.frame.pose = slug;
        })
      }, el("span", { textContent: name })))))
    ];
  }

  #mechMaterials() {
    const used = this.#usedMaterials();
    const frameId = this.#design.csgid;
    const own = Object.keys(this.#design.frame.materials ?? {}).filter(key => !isStandard(key));
    const rows = [...STANDARD_NAMES, ...own].map(key => ({
      key: isStandard(key) ? key : `${frameId}:${key}`,
      own: key,
      material: this.#materialOf(key),
      isUsed: used.has(isStandard(key) ? key : `${frameId}:${key}`)
    }));

    return rows.map(row => ({ ...row, key: row.own, name: row.material.name }));
  }

  #materialOf(key) {
    const plain = key.includes(":") ? key.split(":").at(-1) : key;
    const json = this.#design.frame.materials?.[plain] ?? {};

    if (isStandard(plain)) return standard(plain, { ...this.#standardFromFigure(plain), ...json });

    return standard("primary", { name: plain, ...json });
  }

  #standardFromFigure(name) {
    const material = this.#preview?.figure.material(name);

    if (!material) return {};

    const { pattern, colors, size, bump, bright } = material;

    return { name: material.name, pattern, colors: [...colors], size, bump, bright };
  }

  #usedMaterials() {
    const figure = this.#preview?.figure;

    if (!figure) return new Set(STANDARD_NAMES);

    return new Set(figure.pieces.flatMap(piece => piece.mesh.slots.map(slot => piece.materialOf(slot))));
  }

  #materialJson(key) {
    const material = this.#materialOf(key);
    const { name, pattern, colors, size, bump, bright } = material;

    return { ...this.#design.frame.materials?.[key], name, pattern, colors: [...colors], size, bump, bright };
  }

  #scheme(colors) {
    this.#edit(design => {
      SCHEME_NAMES.forEach((name, index) => {
        const json = this.#materialJson(name);

        design.frame.materials = { ...design.frame.materials, [name]: { ...json, colors: colorsFor(json, colors[index]) } };
      });
    });
  }

  #resetPaint(key) {
    this.#edit(design => {
      const base = design.base.materials?.[key];
      const materials = { ...design.frame.materials };

      if (base) materials[key] = structuredClone(base);
      else delete materials[key];

      design.frame.materials = materials;
    });
  }

  #resetLook() {
    this.#edit(design => {
      design.frame.materials = structuredClone(design.base.materials ?? {});
      design.insignia = {};
    });
  }

  #pickEntry(key) {
    this.#entry = key === this.#entry ? null : key;
    this.#render();
  }

  #takeOff(key) {
    if (!this.#design.find(key)) return;

    this.#edit(design => design.takeOff(key));

    if (this.#entry === key) this.#entry = null;
  }

  #clickMech(at) {
    const hit = this.#view.pick(at);

    if (this.#tab === "equip") {
      this.#entry = this.#gearAt(hit)?.key ?? null;
      this.#render();
    } else if (this.#tab === "paint") {
      const name = hit?.surface ? hit.piece.materialOf(hit.surface.material) : "";
      const plain = name.startsWith(`${this.#design.csgid}:`) ? name.split(":").at(-1) : name;

      this.#painted = isStandard(plain) || this.#design.frame.materials?.[plain] ? plain : null;
      this.#render();
    }
  }

  #gearAt(hit) {
    if (!hit || !this.#preview) return null;

    const mount = this.#preview.mounts.find(one => hit.path.includes(one.placement) || hit.piece.path.includes(one.placement));

    return mount ? this.#design.find(mount.item) : null;
  }

  #grabMech(at, event) {
    if (this.#tab !== "equip") return null;

    const one = this.#gearAt(this.#view.pick(at));

    if (!one) return null;

    const what = { csgid: one.csgid, name: one.name, key: one.key };

    this.#beginDrag(what, event, true);

    return {
      move: () => null,
      end: () => null
    };
  }

  #pressTile(event) {
    const tile = event.target.closest("[data-part]");

    if (!tile || event.button !== 0 || this.#tab !== "equip") return;

    event.preventDefault();

    const entry = this.#entries.find(one => one.csgid === tile.dataset.part);

    if (!entry) return;

    this.#beginDrag({ csgid: entry.csgid, name: entry.name, entry, sheet: tile.dataset.sheet, image: tile.querySelector("img")?.src ?? "" }, event, false);
  }

  #beginDrag(what, event, isOnMech) {
    const abort = new AbortController();
    const options = { signal: abort.signal };

    this.#drag = { what, abort, from: [event.clientX, event.clientY], isMoving: false, isOnMech, point: null, points: [] };
    window.addEventListener("pointermove", now => this.#dragMove(now), options);
    window.addEventListener("pointerup", now => this.#dragEnd(now), options);
    window.addEventListener("pointercancel", () => this.#stopDrag(), options);
  }

  async #showPoints() {
    const drag = this.#drag;
    const { what } = drag;
    const shape = await this.#preview.library.load(what.csgid).catch(() => null);
    const frame = this.#preview.frame;

    if (!shape || !frame || this.#drag !== drag) return;

    const gear = this.#gearFor(what);
    const taking = new Set(mountsFor(frame, gear, shape).map(open => open.name));
    const ratio = this.#view.ratio;

    drag.points = this.#preview.figure.sockets.filter(socket => taking.has(socket.name)).map(socket => {
      const [x, y] = this.#view.project(socket.place.origin);
      const holder = this.#preview.mounts.find(mount => mount.at === socket.name && mount.item !== what.key);
      const holderName = holder ? this.#design.find(holder.item)?.name : "";
      const dot = el("div", { className: `point${holder ? " taken" : ""}`, style: `left: ${x / ratio}px; top: ${y / ratio}px`, "data-name": holder ? say("Designer.Swap", { point: plainMount(socket.name), name: holderName }) : plainMount(socket.name) });

      this.#points.append(dot);

      return { name: socket.name, x: x / ratio, y: y / ratio, dot, holder: holder?.item ?? null };
    });

    const ghost = el("div", { className: "merit3d-ghost" }, what.image ? el("img", { src: what.image, alt: "" }) : null, what.name);

    drag.ghost = ghost;
    document.body.append(ghost);

    if (!drag.points.length) ui.notifications.warn(say("Designer.NoPoint", { name: what.name }));
  }

  #dragMove(event) {
    const drag = this.#drag;

    if (!drag) return;

    if (!drag.isMoving) {
      if (Math.hypot(event.clientX - drag.from[0], event.clientY - drag.from[1]) < DRAG) return;

      drag.isMoving = true;
      this.#showPoints();
    }

    if (drag.ghost) Object.assign(drag.ghost.style, { left: `${event.clientX}px`, top: `${event.clientY}px` });

    const box = this.#stage.getBoundingClientRect();
    const [x, y] = [event.clientX - box.left, event.clientY - box.top];
    const near = drag.points.map(point => ({ point, distance: Math.hypot(point.x - x, point.y - y) })).sort((a, b) => a.distance - b.distance)[0];

    drag.point = near?.distance < REACH ? near.point : null;

    for (const point of drag.points) point.dot.classList.toggle("near", point === drag.point);
  }

  #dragEnd(event) {
    const { what, isMoving, isOnMech, point } = this.#drag;

    this.#stopDrag();

    if (!isMoving) {
      if (isOnMech) this.#pickEntry(what.key);
      else this.#equip(what, "");

      return;
    }

    if (point) return this.#equip(what, point.name, point.holder);

    const under = what.key ? null : this.#gearUnder(event);

    if (under) {
      this.#useLook(under, what.csgid);
      this.#entry = under;
    } else if (isOnMech && !this.#isOverMech(event)) {
      this.#takeOff(what.key);
    }
  }

  #equip(what, at, holder = null) {
    const from = what.key ? this.#preview?.mounts.find(mount => mount.item === what.key)?.at ?? "" : "";
    const fits = (key, socket) => this.#fits(key, socket);

    this.#edit(design => {
      let key = what.key;

      if (!key && what.sheet) {
        const own = design.gear.find(one => !one.removed && !one.byHand && one.lid === what.sheet);

        if (own) {
          own.csgid = what.csgid;
          key = own.key;
        }
      }

      key ??= design.addPart({ ...what.entry, kind: kindFor(what.entry) }, at);

      design.putOn(key, at, { holder, from, fits });
      this.#entry = key;
    });
  }

  #fits(key, socket) {
    const one = this.#design.find(key);
    const shape = one && this.#preview?.library.find(one.csgid);
    const frame = this.#preview?.frame;

    return Boolean(shape && frame) && mountsFor(frame, this.#gearFor(one), shape).some(open => open.name === socket);
  }

  #gearFor(what) {
    const one = what.key ? this.#design.find(what.key) : null;
    const lid = one?.lid ?? what.sheet ?? what.entry?.lids?.[0] ?? "";
    const known = gearOf(this.#actor).find(gear => gear.lid === lid);
    const entry = what.entry ?? this.#entries.find(item => item.csgid === what.csgid);

    return {
      kind: one?.kind ?? (entry ? kindFor(entry) : "system"),
      size: known?.size ?? entry?.sizes?.[0] ?? "",
      weapon: known?.weapon ?? entry?.weapon ?? ""
    };
  }

  #isOverMech(event) {
    const box = this.#stage.getBoundingClientRect();

    return event.clientX > box.left && event.clientX < box.right && event.clientY > box.top && event.clientY < box.bottom;
  }

  #stopDrag() {
    this.#drag?.abort.abort();
    this.#drag?.ghost?.remove();
    this.#points.replaceChildren();
    this.#drag = null;
  }

  #input(event) {
    const input = event.target;
    const { field } = input.dataset;

    if (!field) return;

    const value = input.type === "checkbox" ? input.checked : input.value;
    const key = input.closest("[data-material]")?.dataset.material;

    this.#beginEdit();

    if (field === "color") {
      const json = this.#materialJson(key);
      const index = Number(input.dataset.index);
      const colors = index ? json.colors.map((color, i) => i === index ? value : color) : colorsFor(json, value);

      this.#design.frame.materials = { ...this.#design.frame.materials, [key]: { ...json, colors } };
    } else if (field === "pattern") {
      this.#design.frame.materials = { ...this.#design.frame.materials, [key]: { ...this.#materialJson(key), pattern: value } };
    } else if (field === "size" || field === "turn") {
      const one = this.#design.find(this.#entry);
      const name = field === "size" ? "size" : input.dataset.turn;

      if (one) one.place = { ...one.place, [name]: Number(value) };
    } else if (field === "slot") {
      const one = this.#design.find(this.#entry);
      const { [input.dataset.own]: gone, ...paint } = one?.place?.paint ?? {};

      if (one) one.place = { ...one.place, paint: value ? { ...paint, [input.dataset.own]: value } : paint };
    } else if (field.startsWith("insignia.")) {
      const name = field.slice("insignia.".length);

      this.#setInsignia({ [name]: input.type === "range" ? Number(value) : value });
    }

    this.#rebuild();
  }

  #changed(event) {
    if (!event.target.dataset.field) return;

    this.#endEdit();
    this.#render();
  }

  #key(event) {
    const key = event.key.toLowerCase();
    const isCommand = event.ctrlKey || event.metaKey;
    const isTyping = event.target.matches("input:not([type=checkbox], [type=color], [type=range]), select");

    let isHandled = true;

    if (isCommand && key === "s") this.save();
    else if (isTyping) isHandled = false;
    else if (isCommand && key === "z") event.shiftKey ? this.#redo() : this.#undo();
    else if (isCommand && key === "y") this.#redo();
    else if ((key === "delete" || key === "backspace") && this.#entry && this.#tab === "equip") this.#takeOff(this.#entry);
    else isHandled = false;

    if (isHandled) event.preventDefault();
    if (isHandled || key !== "escape") event.stopPropagation();
  }

  #edit(change) {
    this.#endEdit();

    const before = this.#snapshot();

    change(this.#design);

    if (this.#snapshot() !== before) this.#remember(before);

    this.#rebuild().then(() => this.#render());
  }

  #beginEdit() {
    this.#pending ??= this.#snapshot();
  }

  #endEdit() {
    const before = this.#pending;

    this.#pending = null;

    if (before !== null && before !== this.#snapshot()) this.#remember(before);
  }

  #remember(state) {
    this.#history.push(state);
    this.#future = [];

    if (this.#history.length > MOST) this.#history.shift();
  }

  #undo() {
    this.#endEdit();

    const state = this.#history.pop();

    if (!state) return;

    this.#future.push(this.#snapshot());
    this.#design.state = state;
    this.#rebuild().then(() => this.#render());
  }

  #redo() {
    this.#endEdit();

    const state = this.#future.pop();

    if (!state) return;

    this.#history.push(this.#snapshot());
    this.#design.state = state;
    this.#rebuild().then(() => this.#render());
  }

  async #rebuild() {
    if (this.#building) {
      this.#again = true;

      return this.#building;
    }

    this.#building = (async () => {
      do {
        this.#again = false;
        this.#preview = await this.#design.preview().catch(error => {
          console.warn(error);

          return this.#preview;
        });
      } while (this.#again);

      if (!this.#catalog) await this.#loadCatalog();

      this.#showPreview();
    })();

    await this.#building;
    this.#building = null;
  }

  #showPreview() {
    const figure = this.#preview?.figure;

    if (!figure || !this.#view) return;

    const pose = this.#design.frame.poses?.[this.#design.frame.pose];

    figure.land();

    if (this.#view.figure) this.#view.show(figure);
    else {
      this.#view.show(figure);
      this.#view.fit();
    }

    tokenMechs.setPreview(this.#actor, this.isDirty ? { ...this.#preview, actor: this.#actor, mech: mechItemOf(this.#actor), gear: gearItemsOf(this.#actor), isPreview: true, pose } : null);
  }

  get preview() {
    return this.#preview;
  }
}

function plainMount(name) {
  if (!name) return "";

  const words = name.replace(/^mount-/, "").split("-");

  return words.join(" ").replace(/^./, letter => letter.toUpperCase());
}

function shapeUses(shape, name) {
  return [...shape.everything].some(one => Object.hasOwn(one.materials ?? {}, name)) || name === "primary";
}

function swatchStyle(material) {
  const colors = material.colors.slice(0, PATTERN_COLORS[material.pattern] ?? 1);

  return colors.length > 1 ? `background: linear-gradient(135deg, ${colors.join(", ")})` : `background: ${colors[0]}`;
}
