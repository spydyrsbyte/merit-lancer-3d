/*
  Turns bytes into a link which holds them, and reads the bytes behind any link.
  Holding them in the link itself is how a mesh fits into JSON.
*/

const TYPE = "data:application/octet-stream;base64,";
const CHUNK = 8192;

export function toUri(bytes) {
  let text = "";

  for (let start = 0; start < bytes.length; start += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }

  return TYPE + btoa(text);
}

export async function readUri(uri) {
  const response = await fetch(uri);

  if (!response.ok) throw new Error(`${response.status} for ${uri.slice(0, 80)}`);

  return new Uint8Array(await response.arrayBuffer());
}
