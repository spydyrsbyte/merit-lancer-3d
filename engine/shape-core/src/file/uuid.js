/*
  A new random uuid. Browsers have this built in, but only on secure pages, and
  many games are hosted on plain ones.
*/

export function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  bytes[6] = bytes[6] & 0x0f | 0x40;
  bytes[8] = bytes[8] & 0x3f | 0x80;

  const digits = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  const groups = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/.exec(digits);

  return groups.slice(1).join("-");
}
