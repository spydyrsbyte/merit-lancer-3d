/*
  Small pieces of a page: elements, buttons, and fields with a label.

  A field has two actions. "set" is told every value while it is being changed, so one
  can watch, and "done" that it is finished. Fields have a key, so the one in use can
  be found again after everything around it was drawn anew.

  A number which is not finished, such as a lone minus, is not told to anybody.
*/

import { icon } from "./icons.js";

const DIGITS = 1000;
const nothing = () => null;

export function el(tag, values = {}, ...children) {
  const element = document.createElement(tag);
  const { data, on, attributes, ...rest } = values;

  Object.assign(element, rest);
  Object.assign(element.dataset, data ?? {});

  for (const [name, value] of Object.entries(attributes ?? {})) element.setAttribute(name, value);
  for (const [name, action] of Object.entries(on ?? {})) element.addEventListener(name, action);

  element.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false));

  return element;
}

export function button(text, action, { symbol, ...values } = {}) {
  return el("button", { type: "button", ...values, on: { click: action } }, symbol && icon(symbol), text && el("span", { textContent: text }));
}

export function iconButton(symbol, title, action, values = {}) {
  const className = ["icon", values.className].filter(Boolean).join(" ");

  return el("button", { type: "button", title, ...values, className, attributes: { "aria-label": title }, on: { click: action } }, icon(symbol));
}

export function heading(text, ...more) {
  return el("h3", {}, el("span", { textContent: text }), ...more);
}

export function note(text, className = "hint") {
  return el("p", { className, textContent: text });
}

export function field(label, ...controls) {
  return el("label", { className: "field" }, el("span", { textContent: label }), ...controls);
}

export function textField(label, value, { key = label, done = nothing, list, hint, title = "" } = {}) {
  const input = el("input", {
    type: "text", value: value ?? "", placeholder: hint ?? "", maxLength: 100, title, spellcheck: false,
    data: { key },
    on: { change: event => done(event.target.value.trim()) }
  });

  if (list) input.setAttribute("list", list);

  return field(label, input);
}

export function wordsField(label, words, { done, ...rest }) {
  const split = text => [...new Set(text.split(/[,\s]+/).filter(Boolean))];

  return textField(label, [words ?? []].flat().join(", "), { ...rest, done: text => done(split(text)) });
}

export function numberInput(value, { key, set = nothing, done = nothing, step = 1, min, max, title = "" } = {}) {
  const input = el("input", {
    type: "number", step: "any", value: shown(value), title,
    data: { key },
    on: {
      input: event => tell(event.target, set),
      change: event => {
        tell(event.target, set);
        done();
      },
      keydown: event => nudge(event, step, set)
    }
  });

  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;

  return input;
}

export function numberField(label, value, options = {}) {
  return field(label, numberInput(value, { key: label, ...options }));
}

export function vectorField(label, values, axes, { set, done, step = 1, min } = {}) {
  const inputs = values.map((value, index) => el("label", { title: axes[index][1], data: { axis: "xyz"[index] } },
    el("span", { textContent: axes[index][0] }),
    numberInput(value, {
      key: `${label} ${index}`, step, min, done,
      set: number => set(index, number)
    })));

  return el("fieldset", { data: { vector: label } }, el("legend", { textContent: label }), ...inputs);
}

export function checkField(label, value, done, title = "") {
  const input = el("input", { type: "checkbox", checked: value, data: { key: label }, on: { change: event => done(event.target.checked) } });

  return el("label", { className: "check", title }, input, el("span", { textContent: label }));
}

export function select(value, choices, done, key) {
  const isKnown = choices.some(([id]) => id === value);
  const groups = Map.groupBy(isKnown ? choices : [[value, "(not there)"], ...choices], ([, , group]) => group ?? "");
  const optionOf = ([id, text]) => el("option", { value: id, textContent: text, selected: id === value });
  const parts = [...groups].map(([group, all]) => group ? el("optgroup", { label: group }, ...all.map(optionOf)) : all.map(optionOf));

  return el("select", { data: { key }, on: { change: event => done(event.target.value) } }, ...parts.flat());
}

export function selectField(label, value, choices, done) {
  return field(label, select(value, choices, done, label));
}

export function colorInput(value, { key, set = nothing, done = nothing }) {
  return el("input", { type: "color", value, data: { key }, on: { input: event => set(event.target.value), change: () => done() } });
}

export function sliderField(label, value, { low, high, step = 1, set, done = nothing }) {
  const both = number => {
    for (const other of [range, box]) if (Number(other.value) !== number) other.value = number;

    set(number);
  };

  const range = el("input", {
    type: "range", min: low, max: high, step, value,
    data: { key: `${label} slider` },
    on: { input: event => both(Number(event.target.value)), change: () => done() }
  });

  const box = numberInput(value, { key: `${label} number`, step, set: both, done });

  return el("label", { className: "field row" }, el("span", { textContent: label }), range, box);
}

export function list(id, words) {
  return el("datalist", { id }, ...words.map(value => el("option", { value })));
}

export function redraw(box, children) {
  const active = box.contains(document.activeElement) ? document.activeElement : null;
  const key = active?.dataset.key;
  const scrolls = [...box.querySelectorAll("[data-scroll]")].map(one => [one.dataset.scroll, one.scrollTop]);
  const { scrollTop } = box;

  box.replaceChildren(...children.flat().filter(Boolean));
  box.scrollTop = scrollTop;

  for (const [name, top] of scrolls) {
    const one = box.querySelector(`[data-scroll="${name}"]`);

    if (one) one.scrollTop = top;
  }

  if (key) box.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

function tell(input, set) {
  const text = input.value.trim();
  const number = Number(text);

  if (text && Number.isFinite(number)) set(number);
}

function nudge(event, step, set) {
  const way = { ArrowUp: 1, ArrowDown: -1 }[event.key];

  if (!way) return;

  event.preventDefault();

  const input = event.target;
  const next = (Number(input.value) || 0) + way * step * (event.shiftKey ? 10 : 1);
  const low = input.min === "" ? -Infinity : Number(input.min);
  const high = input.max === "" ? Infinity : Number(input.max);

  input.value = shown(Math.max(low, Math.min(high, next)));
  tell(input, set);
}

function shown(value) {
  return Math.round(value * DIGITS) / DIGITS;
}
