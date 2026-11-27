/*
  Where the JSON of shapes comes from. A source answers three questions:
    read(key)    the JSON of a shape, or null if it does not have it
    open(uri)    the bytes behind a link in that JSON
    mesh(shape)  the bytes of its mesh, if the source has them itself

  A key is an id, or an id and a revision as "id@2".
*/

import { readUri } from "./uri.js";

export class Shelf {
  #shapes = new Map();

  put(json) {
    this.#shapes.set(json.id, json);
    this.#shapes.set(`${json.id}@${json.revision ?? 1}`, json);
  }

  async read(key) {
    return this.#shapes.get(key) ?? null;
  }

  async open(uri) {
    return readUri(uri);
  }

  mesh() {
    return null;
  }
}

export class Folder {
  #address;

  constructor(address) {
    this.#address = address.endsWith("/") ? address : `${address}/`;
  }

  async read(key) {
    const response = await fetch(this.#locate(`${encodeURIComponent(key)}.json`));

    if (!response.ok) return null;

    return response.json();
  }

  async open(uri) {
    return readUri(this.#locate(uri));
  }

  mesh() {
    return null;
  }

  #locate(uri) {
    return new URL(uri, this.#address).href;
  }
}
