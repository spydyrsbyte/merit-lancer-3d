/*
  Collects the triangles of a mesh. Corners which are alike are stored once.
*/

const PRECISION = 1e5;

export class MeshBuilder {
  #positions = [];
  #normals = [];
  #owners = [];
  #indices = [];
  #surfaces = [];
  #known = new Map();

  addSolid(solid) {
    const owner = this.#addSurface(solid.surface);

    for (const face of solid.shell) this.#addFace(face, owner);
  }

  addMesh(mesh, transform, adopt) {
    const owners = mesh.surfaces.map(surface => this.#addSurface(adopt(surface)));

    const corners = Array.from({ length: mesh.corners }, (_, corner) => {
      const point = transform.point(mesh.point(corner));
      const normal = transform.normal(mesh.normal(corner));

      return this.#addCorner(point, normal, owners[mesh.owners[corner]]);
    });

    for (let i = 0; i < mesh.indices.length; i += 3) {
      const triangle = Array.from(mesh.indices.subarray(i, i + 3), index => corners[index]);

      if (transform.flipped) triangle.reverse();

      this.#indices.push(...triangle);
    }
  }

  finish() {
    return {
      positions: new Float32Array(this.#positions),
      normals: new Float32Array(this.#normals),
      owners: new Uint16Array(this.#owners),
      indices: new Uint32Array(this.#indices),
      surfaces: this.#surfaces
    };
  }

  #addSurface(surface) {
    return this.#surfaces.push(surface) - 1;
  }

  #addFace(face, owner) {
    const corners = face.points.map((point, i) => this.#addCorner(point, face.normals[i], owner));

    for (let i = 1; i < corners.length - 1; i++) this.#indices.push(corners[0], corners[i], corners[i + 1]);
  }

  #addCorner(point, normal, owner) {
    const key = [...point, ...normal].map(n => Math.round(n * PRECISION)).join() + "/" + owner;

    if (this.#known.has(key)) return this.#known.get(key);

    const corner = this.#owners.push(owner) - 1;

    this.#positions.push(...point);
    this.#normals.push(...normal);
    this.#known.set(key, corner);

    return corner;
  }
}
