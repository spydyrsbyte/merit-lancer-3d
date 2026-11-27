/*
  Makes bytes smaller, and back again, with what is built into browsers.

  A small file can be made to unpack into an enormous one, to crash whoever opens
  it. So unpacking stops when it gets larger than any shape could need.
*/

const METHOD = "deflate";
const LIMIT = 64 * 1024 * 1024;

export async function squeeze(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(METHOD));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unsqueeze(bytes, limit = LIMIT) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(METHOD));
  const parts = [];

  let size = 0;

  for await (const part of chunks(stream)) {
    size += part.length;

    if (size > limit) throw new Error("This picture holds too much data");

    parts.push(part);
  }

  return new Uint8Array(await new Blob(parts).arrayBuffer());
}

async function* chunks(stream) {
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) return;

      yield value;
    }
  } finally {
    await reader.cancel().catch(() => null);
  }
}
