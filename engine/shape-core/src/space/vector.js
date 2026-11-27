/*
  Vectors are plain arrays of three numbers: [right, forward, up].
*/

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a, amount) => [a[0] * amount, a[1] * amount, a[2] * amount];

export const negate = a => [-a[0], -a[1], -a[2]];

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export const length = a => Math.hypot(a[0], a[1], a[2]);

export const unit = a => scale(a, 1 / (length(a) || 1));

export const mix = (a, b, amount) => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount
];

export const distance = (a, b) => length(subtract(a, b));
