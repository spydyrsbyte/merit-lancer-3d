/*
  Making elements: a tag, its values, and what is in it. Values which start with "on"
  are listeners, such as onclick.
*/

export function el(tag, values = {}, ...children) {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === false) continue;

    if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
    else if (name in element && name !== "list") element[name] = value;
    else element.setAttribute(name, value === true ? "" : value);
  }

  element.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false));

  return element;
}

export function row(label, ...controls) {
  return el("div", { className: "form-group" }, el("label", { textContent: label }), el("div", { className: "form-fields" }, ...controls));
}

export function choice(value, options, change) {
  const select = el("select", { onchange: () => change(select.value) },
    ...options.map(({ value: one, label }) => el("option", { value: one, textContent: label, selected: one === value })));

  return select;
}

export function action(label, icon, act, values = {}) {
  return el("button", { type: "button", onclick: act, ...values }, el("i", { className: `fa-solid ${icon}`, inert: true }), ` ${label}`);
}
