/*
  Keeps finished meshes in the browser, so a reload needs no download and no math.

  It uses IndexedDB, the database in every browser, because that also works on
  pages without https. When it is too full, what was not used for the longest
  time is removed.

  It only saves time. If it fails for any reason, everything works without it.
*/

const STORE = "meshes";
const LIMIT = 200 * 1024 * 1024;

export class Disk {
  #name;
  #opening;

  constructor(name = "shape-core") {
    this.#name = name;
  }

  async get(key) {
    const store = await this.#store("readwrite");
    const entry = await finished(store.get(key));

    if (!entry) return null;

    store.put({ ...entry, used: Date.now() });

    return entry.bytes;
  }

  async put(key, bytes) {
    const store = await this.#store("readwrite");

    await finished(store.put({ key, bytes, used: Date.now() }));
  }

  async trim(limit = LIMIT) {
    const store = await this.#store("readwrite");
    const entries = await finished(store.getAll());

    const newest = entries.sort((a, b) => b.used - a.used);

    let total = 0;

    for (const { key, bytes } of newest) {
      total += bytes.length;

      if (total > limit) store.delete(key);
    }
  }

  async clear() {
    const store = await this.#store("readwrite");

    await finished(store.clear());
  }

  async #store(mode) {
    this.#opening ??= this.#open();

    const database = await this.#opening;

    return database.transaction(STORE, mode).objectStore(STORE);
  }

  #open() {
    const request = indexedDB.open(this.#name, 1);

    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });

    return finished(request);
  }
}

function finished(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
