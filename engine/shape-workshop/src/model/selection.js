/*
  The Selection is the ids of what is selected. The first is the one whose properties
  are shown and which has the handles.
*/

export class Selection {
  ids = [];

  get first() {
    return this.ids[0] ?? null;
  }

  has(id) {
    return this.ids.includes(id);
  }

  set(...ids) {
    this.ids = ids.filter(Boolean);
  }

  toggle(id) {
    this.ids = this.has(id) ? this.ids.filter(one => one !== id) : [id, ...this.ids];
  }

  keep(draft) {
    this.ids = draft ? this.ids.filter(id => draft.get(id)) : [];
  }
}
