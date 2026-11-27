/*
  What the rules say about a shape: the words they offer, and those they do not have.
  Nothing is enforced.
*/

const SIDES = ["left", "right"];

export function rulesOf(shape, book) {
  return book.rulesFor(shape.format);
}

export function suggestions(book) {
  const merged = read => [...new Set(book.all.flatMap(read))];
  const conventions = merged(rules => rules.conventions);

  return {
    joints: conventions.flatMap(word => SIDES.includes(word) ? [] : [word, ...SIDES.map(side => `${word}-${side}`)]),
    keywords: merged(rules => rules.keywords)
  };
}

export function problemsOf(draft, book) {
  const { shape } = draft;
  const missing = draft.missing.map(use => `The shape ${use} is not there, so there is a box instead`);
  const broken = shape.warnings.map(text => text.replace(`${shape.name}: `, ""));

  return [...new Set([...missing, ...broken, ...wordProblems(shape, book)])];
}

export function directions(joint, rules) {
  const [first] = joint.split("-");
  const words = rules?.movements[first.replace(/\d+$/, "")] ?? {};
  const found = {};

  for (const [word, direction] of Object.entries(words)) {
    const [, sign, moves, axis] = /^([+-])(m?)([xyz])$/.exec(direction) ?? [];

    if (!axis) continue;

    const key = `${moves ? "move" : "turn"} ${axis}`;

    found[key] ??= {};
    found[key][sign] = word;
  }

  return found;
}

function wordProblems(shape, book) {
  if (!shape.format) return [];

  const rules = rulesOf(shape, book);

  if (!rules) return [`The rules ${shape.format.name} are not loaded`];
  if (book.isOther(shape.format)) return [`The rules called ${rules.name} which are loaded are other rules than these follow. They are used anyway.`];

  const joints = shape.sockets.map(({ movement }) => movement?.name).filter(Boolean);
  const keywords = [...shape.keywords, ...shape.parts.flatMap(placement => placement.keywords)];

  return [
    ...joints.filter(name => !rules.knows(name)).map(name => `${rules.name} has no joint ${name}`),
    ...keywords.filter(word => !rules.keywords.includes(word)).map(word => `${rules.name} has no keyword ${word}`)
  ];
}
