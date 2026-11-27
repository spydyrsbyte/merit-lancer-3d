/*
  What the keys do. While something is being typed, only saving and opening work, so
  that undo is still that of the field. Ctrl+Shift+N is left to the program around it.
*/

const MODES = { 1: "move", 2: "turn", 3: "size" };
const TEXT = "input:not([type=checkbox], [type=color], [type=range]), textarea, select";

const COMMANDS = {
  z: workshop => workshop.undo(),
  y: workshop => workshop.redo(),
  d: workshop => workshop.duplicate(),
  x: workshop => workshop.cut(),
  v: workshop => workshop.paste()
};

const ALWAYS = {
  s: (workshop, event) => workshop.desk.save(event.shiftKey),
  o: workshop => workshop.desk.openFiles(),
  n: workshop => workshop.desk.start()
};

export function keyAction(workshop, event) {
  const action = actionOf(event);

  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  action(workshop, event);
}

function actionOf(event) {
  const key = event.key.toLowerCase();
  const isCommand = event.ctrlKey || event.metaKey;

  if (isCommand && key === "n" && event.shiftKey) return null;
  if (isCommand && ALWAYS[key]) return ALWAYS[key];
  if (event.target.matches(TEXT)) return null;
  if (isCommand && key === "z" && event.shiftKey) return COMMANDS.y;
  if (isCommand) return COMMANDS[key] ?? null;
  if (key === "delete" || key === "backspace") return workshop => workshop.remove();
  if (key === "escape") return workshop => workshop.stop();
  if (key === "f") return workshop => workshop.view.fit();
  if (MODES[key]) return workshop => workshop.setMode(MODES[key]);

  return null;
}
