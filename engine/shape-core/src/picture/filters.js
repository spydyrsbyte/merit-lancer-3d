/*
  A PNG does not store the numbers of a row, but how they differ from a guess, as
  small differences squeeze better. There are five ways to guess a number:
    0  nothing
    1  the same color one dot to the left
    2  the same color one row up
    3  halfway between those two
    4  whichever of left, up and the one up to the left fits best ("Paeth")

  Each row starts with a byte which says which way it uses.
*/

const GUESSES = [
  () => 0,
  left => left,
  (left, up) => up,
  (left, up) => left + up >> 1,
  paeth
];

export function unfilter(bytes, rowSize, rows, step) {
  const out = new Uint8Array(rowSize * rows);

  for (let row = 0; row < rows; row++) {
    const source = row * (rowSize + 1);
    const start = row * rowSize;
    const guess = GUESSES[bytes[source]];

    if (!guess) throw new Error("This PNG is damaged");

    for (let i = 0; i < rowSize; i++) {
      const [left, up, corner] = around(out, start, i, rowSize, step);

      out[start + i] = bytes[source + 1 + i] + guess(left, up, corner);
    }
  }

  return out;
}

export function filter(bytes, rowSize, rows, step) {
  const out = new Uint8Array((rowSize + 1) * rows);

  for (let row = 0; row < rows; row++) {
    const start = row * rowSize;
    const tries = GUESSES.map(guess => differences(bytes, start, rowSize, step, guess));
    const sizes = tries.map(sizeOf);
    const best = sizes.indexOf(Math.min(...sizes));

    out[row * (rowSize + 1)] = best;
    out.set(tries[best], row * (rowSize + 1) + 1);
  }

  return out;
}

function differences(bytes, start, rowSize, step, guess) {
  const out = new Uint8Array(rowSize);

  for (let i = 0; i < rowSize; i++) {
    const [left, up, corner] = around(bytes, start, i, rowSize, step);

    out[i] = bytes[start + i] - guess(left, up, corner);
  }

  return out;
}

function around(bytes, start, i, rowSize, step) {
  const first = i < step;
  const above = start + i - rowSize;

  const left = first ? 0 : bytes[start + i - step];
  const up = start ? bytes[above] : 0;
  const corner = first || !start ? 0 : bytes[above - step];

  return [left, up, corner];
}

function sizeOf(row) {
  return row.reduce((sum, byte) => sum + Math.min(byte, 256 - byte), 0);
}

function paeth(left, up, corner) {
  const guess = left + up - corner;
  const toLeft = Math.abs(guess - left);
  const toUp = Math.abs(guess - up);
  const toCorner = Math.abs(guess - corner);

  if (toLeft <= toUp && toLeft <= toCorner) return left;

  return toUp <= toCorner ? up : corner;
}
