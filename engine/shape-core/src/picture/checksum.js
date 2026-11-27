/*
  A number which changes if any byte does. It is the known formula "CRC-32".
*/

const CHECKS = Uint32Array.from({ length: 256 }, (_, value) => {
  let check = value;

  for (let bit = 0; bit < 8; bit++) check = check & 1 ? check >>> 1 ^ 0xedb88320 : check >>> 1;

  return check;
});

export function checksum(...parts) {
  let check = 0xffffffff;

  for (const part of parts) {
    for (const byte of part) check = CHECKS[(check ^ byte) & 255] ^ check >>> 8;
  }

  return (check ^ 0xffffffff) >>> 0;
}
