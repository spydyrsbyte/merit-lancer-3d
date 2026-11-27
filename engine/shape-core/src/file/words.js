/*
  Names are made of words with a dash between, and each word can have a number:
    hip    hip02    hip-left    finger03-hand-left

  The first word says what something is. The rest says which one, and is passed on
  to what hangs on it: a "knee" inside of "hip-left" is "knee-left". A name which
  already says which one keeps it.
*/

const WORD = /^([a-z]+)(\d{0,3})$/;

export function parseName(name) {
  const words = String(name).split("-").map(word => WORD.exec(word));

  if (words.some(match => !match)) return null;

  return words.map(([, word, digits]) => ({ word, number: Number(digits) || 1 }));
}

export function which(name) {
  const dash = name.indexOf("-");

  return dash < 0 ? "" : name.slice(dash);
}

export function within(name, outer) {
  return name.includes("-") ? name : name + outer;
}
