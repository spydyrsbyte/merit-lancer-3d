/*
  The Markers are the lines over the figure: the edges of what is selected, the cuts,
  and where the sockets, joints, plugs and insignia are. Those have a dot which can be
  clicked, as there is nothing else to hit.

  The arrow of a socket points the way its up does.

  A shape with too many edges to be seen through gets a box around it instead.
*/

import { Bounds, Rig } from "../../../shape-core/src/index.js";
import { boxEdges, edgesOf } from "./edges.js";

export const MARKER_COLORS = { joint: "#f0c35a", socket: "#5fd3ff", plug: "#c79bff", insignia: "#8ee08a", cut: "#f26b61" };

const SELECTED = "#f0a63a";
const GHOST = "#6df0d3";
const DOT = 5;
const REACH = 9;
const ARROW = 24;
const DASH = [5, 4];
const CIRCLE = Math.PI * 2;
const MOST_EDGES = 160;

export function markerKind({ kind, value }) {
  if (kind === "socket" && value.movement?.name) return "joint";
  if (kind === "shape") return value.cut ? "cut" : "";

  return kind;
}

export function markersOf(draft) {
  const marked = draft.items.filter(markerKind).map(item => ({ item, kind: markerKind(item), place: draft.find(item.id)?.world }));

  return marked.filter(({ place }) => place);
}

export function markerAt(view, markers, at) {
  const reach = REACH * view.ratio;

  const near = markers.map(marker => {
    const [x, y] = view.project(marker.place.origin);

    return { ...marker, far: Math.hypot(x - at[0], y - at[1]) };
  });

  const [best] = near.filter(({ far }) => far < reach).sort((a, b) => a.far - b.far);

  return best?.item ?? null;
}

export function drawMarkers(context, view, draft, markers, selection) {
  for (const marker of markers) {
    const isSelected = selection.has(marker.item.id);
    const color = isSelected ? SELECTED : MARKER_COLORS[marker.kind];

    if (marker.kind === "cut") drawLines(context, view, cutLines(draft, marker), color, DASH);
    if (marker.kind === "insignia") drawLines(context, view, insigniaLines(marker), color, DASH);

    drawDot(context, view, marker, color, isSelected);
  }
}

export function drawSelected(context, view, draft, selection) {
  const whole = selection.ids.filter(id => draft.get(id)?.kind === "shape");

  for (const id of whole) {
    const { hidden, cut } = draft.get(id).value;
    const place = draft.find(id)?.world;

    if (!place || cut) continue;

    const { shape } = draft.thing(id);
    const lines = hidden ? shapeLines(shape, place) : seenLines(view.figure, id);

    drawLines(context, view, lines.length > MOST_EDGES ? boxLines(shape, place) : lines, SELECTED, hidden ? DASH : []);
  }
}

export function drawUses(context, view, ids, dash = []) {
  const lines = view.figure.pieces.flatMap(piece => {
    const isInside = piece.path.some(id => ids.has(id));
    const edges = edgesOf(piece.mesh, surface => isInside || surface.path.some(id => ids.has(id)));

    return edges.map(line => line.map(point => piece.world.point(point)));
  });

  drawLines(context, view, lines, SELECTED, dash);
}

export function placementsUsing(shape, id, found = new Set()) {
  for (const placement of shape.parts) {
    if (placement.use === id) found.add(placement.id);
    else placementsUsing(placement.shape, id, found);
  }

  return found;
}

export function drawGhost(context, view, { shape, place }) {
  if (!shape) {
    drawDot(context, view, { kind: "socket", place }, GHOST, true);

    return;
  }

  drawLines(context, view, shapeLines(shape, place), GHOST);
}

export function shapeLines(shape, place) {
  return new Rig(shape).pieces.flatMap(piece => {
    const world = place.times(piece.world);

    return edgesOf(piece.mesh).map(line => line.map(point => world.point(point)));
  });
}

function seenLines(figure, id) {
  return figure.pieces.flatMap(piece => {
    const isInside = piece.path.includes(id);
    const lines = edgesOf(piece.mesh, surface => isInside || !piece.chain.length && surface.path[0] === id);

    return lines.map(line => line.map(point => piece.world.point(point)));
  });
}

function boxLines(shape, place) {
  const points = new Rig(shape).pieces.flatMap(piece => piece.mesh.outline.map(point => piece.world.point(point)));
  const { low, high } = Bounds.around(points);

  return boxEdges(low, high).map(line => line.map(point => place.point(point)));
}

function cutLines(draft, { item, place }) {
  return shapeLines(draft.thing(item.id).shape, place);
}

function insigniaLines({ item, place }) {
  const half = item.value.size.map(number => number / 2);
  const lines = boxEdges(half.map(number => -number), half);

  return lines.map(line => line.map(point => place.point(point)));
}

function drawLines(context, view, lines, color, dash = []) {
  context.strokeStyle = color;
  context.lineWidth = 1.5 * view.ratio;
  context.setLineDash(dash.map(number => number * view.ratio));
  context.beginPath();

  for (const [start, end] of lines) {
    context.moveTo(...view.project(start));
    context.lineTo(...view.project(end));
  }

  context.stroke();
  context.setLineDash([]);
}

function drawDot(context, view, { kind, place }, color, isSelected) {
  const [x, y] = view.project(place.origin);
  const size = DOT * view.ratio;

  context.strokeStyle = color;
  context.fillStyle = isSelected ? color : "#14171bcc";
  context.lineWidth = 2 * view.ratio;
  context.beginPath();

  if (kind === "plug") context.rect(x - size, y - size, size * 2, size * 2);
  else context.arc(x, y, size, 0, CIRCLE);

  context.fill();
  context.stroke();

  if (kind !== "socket" && kind !== "plug") return;

  const length = ARROW * view.ratio / view.unit;
  const up = place.rigid.direction([0, 0, length]);
  const tip = place.origin.map((number, axis) => number + up[axis]);

  drawLines(context, view, [[place.origin, tip]], color);
}
