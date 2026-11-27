/*
  A short text which stands for a long one. Different texts give different
  results, for all practical purposes. It is the known formula "cyrb53".
*/

export function hash(text) {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }

  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);

  return (4294967296 * (2097151 & low) + (high >>> 0)).toString(36);
}
