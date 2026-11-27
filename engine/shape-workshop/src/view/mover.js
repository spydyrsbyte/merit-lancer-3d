/*
  The Mover is what dragging does with what is selected:
    a handle       as the gizmo says
    Shift+drag     across the ground, and a socket, a plug or insignia sticks to what is
                   under the pointer
    Ctrl+drag      up and down

  Moving takes all which is selected along, and turning and sizing only the first.
*/

import { BUILTINS, isSide, Rig, SIDES, Transform, unit } from "../../../shape-core/src/index.js";
import { rotationOn, surfaceAt, tidy } from "./surface.js";

const MOVE_STEP = 0.5;
const BOTH_WAYS = 2;
const FROM_ABOVE = 0.05;
const STILL = [0, 0, 0];
const SAME = [1, 1, 1];

export class Mover {
  #session;
  #selection;
  #view;
  #gizmo;
  #changed;

  constructor(session, selection, view, gizmo, changed) {
    this.#session = session;
    this.#selection = selection;
    this.#view = view;
    this.#gizmo = gizmo;
    this.#changed = changed;
  }

  get target() {
    const item = this.#draft?.get(this.#selection.first);
    const found = item && this.#draft.find(item.id);

    if (!found) return null;

    const { position = STILL, rotation = STILL, size } = item.value;
    const target = { ground: found.ground, position, rotation };

    if (item.kind === "insignia") return { ...target, size, natural: SAME, growth: [BOTH_WAYS, BOTH_WAYS, BOTH_WAYS], isTimes: false };
    if (item.kind === "shape") return { ...target, size, ...this.#sizing(item) };

    return target;
  }

  grab(at, event) {
    if (!this.#selection.first) return null;
    if (event.shiftKey) return this.#across(at);
    if (event.ctrlKey || event.metaKey) return this.#upward(at);

    const { target } = this;
    const pull = target && this.#gizmo.grab(at, target);

    return pull ? this.#handle(pull, target) : null;
  }

  #handle(pull, target) {
    const starts = this.#starts();
    const id = this.#selection.first;

    return this.#drag((at, event) => {
      const values = pull(at, event.altKey);

      if (!values.position) return this.#draft.update(id, values);

      const change = values.position.map((number, axis) => number - target.position[axis]);

      this.#shift(starts, target.ground.direction(change));
    });
  }

  #across(at) {
    const { id, kind } = this.#draft.get(this.#selection.first);

    if (kind !== "shape") return this.#drag(now => this.#stick(id, now));

    const starts = this.#starts();

    if (!starts.length) return null;

    const height = starts[0].origin[2];
    const from = this.#view.ground(at, height);

    return this.#drag((now, event) => this.#shift(starts, steps(from, this.#view.ground(now, height), event.altKey)));
  }

  #upward(at) {
    const starts = this.#starts();
    const [x, y] = this.#view.toward;

    if (!starts.length || Math.hypot(x, y) < FROM_ABOVE) return null;

    const wall = unit([x, y, 0]);
    const { origin } = starts[0];
    const from = this.#view.plane(at, origin, wall);

    return this.#drag((now, event) => {
      const [, , height] = steps(from, this.#view.plane(now, origin, wall), event.altKey);

      this.#shift(starts, [0, 0, height]);
    });
  }

  #drag(move) {
    const draft = this.#draft;

    let isMoving = false;

    return {
      move: (at, event) => {
        if (!isMoving) draft.begin();

        isMoving = true;
        move(at, event);
        this.#changed();
      },
      end: () => {
        if (!isMoving) return;

        draft.end();
        this.#changed(true);
      }
    };
  }

  #starts() {
    const draft = this.#draft;

    const all = draft.roots(this.#selection.ids).map(id => {
      const found = draft.find(id);

      return found && { id, ground: found.ground, origin: found.world.origin, position: draft.get(id).value.position ?? STILL };
    });

    return all.filter(Boolean);
  }

  #shift(starts, change) {
    for (const { id, ground, position } of starts) {
      const local = new Transform(ground.axes).inverse.direction(change);

      this.#draft.update(id, { position: position.map((number, axis) => tidy(number + local[axis])) });
    }
  }

  #stick(id, at) {
    const draft = this.#draft;
    const surface = surfaceAt(draft, this.#view, at);

    if (!surface || !draft.canAttach(id, surface.at)) return;

    const { kind, value } = draft.get(id);
    const rotation = value.movement?.name ? value.rotation : rotationOn(kind, surface.side);

    draft.update(id, { at: surface.at, position: surface.position, rotation });
  }

  #sizing({ id, value }) {
    const { shape } = this.#draft.thing(id);
    const isTimes = !BUILTINS.has(value.use);
    const last = value.at?.split("/").at(-1) ?? "";
    const growth = SIDES[isSide(last) ? last : "center"].map(number => number ? 1 : BOTH_WAYS);

    return { natural: isTimes ? naturalSize(shape) : SAME, growth, isTimes };
  }

  get #draft() {
    return this.#session.current;
  }
}

function naturalSize(shape) {
  const { pieces } = new Rig(shape);
  const points = pieces.flatMap(piece => piece.mesh.outline.map(point => piece.world.point(point)));

  return [0, 1, 2].map(axis => {
    const numbers = points.map(point => point[axis]);

    return Math.max(1, Math.max(...numbers) - Math.min(...numbers));
  });
}

function steps(from, to, isFree) {
  return to.map((number, axis) => {
    const amount = number - from[axis];

    return isFree ? amount : Math.round(amount / MOVE_STEP) * MOVE_STEP;
  });
}
