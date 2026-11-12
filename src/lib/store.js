// The local database. Every record lives in memory and is written through to
// persistence. Records carry two private flags:
//   _dirty   changed locally since the last successful push
//   _synced  the sheet has seen some version of this record
// Deletes are kept as tombstones (deleted: true) so other devices learn about them.

import { MemoryPersistence } from './idb.js';

export const TABLES = ['weights', 'measurements', 'exercises', 'routines', 'workouts', 'sets', 'settings'];

// Workouts and sets that never reached the sheet can be dropped outright.
const TRANSIENT = new Set(['workouts', 'sets']);

export const clean = (r) => {
  const { _dirty, _synced, ...rest } = r;
  return rest;
};

export class Store {
  constructor(persistence = new MemoryPersistence()) {
    this.p = persistence;
    this.t = {};
    for (const name of TABLES) this.t[name] = new Map();
    this.version = 0;
    this.listeners = new Set();
    this.onLocalChange = null;
    this.now = () => Date.now();
    this._cache = {};
    this._batch = 0;
    this._pending = false;
  }

  async load() {
    const all = await this.p.loadAll();
    for (const name of TABLES) {
      for (const r of all[name] || []) this.t[name].set(r.id, r);
    }
    this._cache = {};
    this._emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    if (this._batch) {
      this._pending = true;
      return;
    }
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  // Groups several writes into one notification.
  batch(fn) {
    this._batch++;
    try {
      return fn();
    } finally {
      this._batch--;
      if (!this._batch && this._pending) {
        this._pending = false;
        this._emit();
      }
    }
  }

  _write(table, rec) {
    this.t[table].set(rec.id, rec);
    this._cache[table] = undefined;
    this.p.putMany(table, [rec]);
  }

  _stamp(prev) {
    return Math.max(this.now(), ((prev && prev.updatedAt) || 0) + 1);
  }

  _changed() {
    if (this.onLocalChange) this.onLocalChange();
  }

  // ---- Reads ----

  raw(table, id) {
    return this.t[table].get(id);
  }

  get(table, id) {
    const r = this.t[table].get(id);
    return r && !r.deleted ? r : undefined;
  }

  list(table) {
    let rows = this._cache[table];
    if (!rows) rows = this._cache[table] = [...this.t[table].values()].filter((r) => !r.deleted);
    return rows;
  }

  setting(key, fallback = '') {
    const r = this.get('settings', key);
    return r ? r.value : fallback;
  }

  // ---- Writes ----

  put(table, rec) {
    const prev = this.t[table].get(rec.id);
    const next = { ...clean(rec), deleted: false, updatedAt: this._stamp(prev), _dirty: true, _synced: !!(prev && prev._synced) };
    this._write(table, next);
    this._emit();
    this._changed();
    return next;
  }

  patch(table, id, fields) {
    const prev = this.get(table, id);
    if (!prev) return undefined;
    return this.put(table, { ...prev, ...fields });
  }

  // Starter data. updatedAt 0 means any real edit or delete, on any device, wins over it.
  putSeed(table, rec) {
    if (this.t[table].has(rec.id)) return;
    this._write(table, { ...rec, deleted: false, updatedAt: 0, _dirty: true, _synced: false });
  }

  remove(table, id) {
    const prev = this.t[table].get(id);
    if (!prev || prev.deleted) return;
    if (TRANSIENT.has(table) && !prev._synced) {
      this.t[table].delete(id);
      this._cache[table] = undefined;
      this.p.deleteMany(table, [id]);
    } else {
      this._write(table, { ...prev, deleted: true, updatedAt: this._stamp(prev), _dirty: true });
    }
    this._emit();
    this._changed();
  }

  setSetting(key, value) {
    this.put('settings', { id: key, value: String(value) });
  }

  // ---- Sync support ----

  // Records to push. A workout stays local until it is finished, and a set stays
  // local until it is done, so the sheet never fills up with half-entered rows.
  dirtySnapshot() {
    const changes = {};
    let count = 0;
    for (const table of TABLES) {
      const rows = [];
      for (const r of this.t[table].values()) {
        if (!r._dirty) continue;
        if (table === 'workouts' && !r._synced && !r.finishedAt) continue;
        if (table === 'sets' && !r._synced) {
          if (!r.done) continue;
          const w = this.t.workouts.get(r.workoutId);
          if (!w || w.deleted || (!w._synced && !w.finishedAt)) continue;
        }
        rows.push(clean(r));
      }
      if (rows.length) {
        changes[table] = rows;
        count += rows.length;
      }
    }
    return { changes, count };
  }

  // Called after a push. A record that changed again during the push stays dirty.
  markClean(changes) {
    for (const table of TABLES) {
      for (const rec of changes[table] || []) {
        const cur = this.t[table].get(rec.id);
        if (!cur) continue;
        if (cur.updatedAt === rec.updatedAt) this._write(table, { ...cur, _dirty: false, _synced: true });
        else if (!cur._synced) this._write(table, { ...cur, _synced: true });
      }
    }
  }

  // Merges records from the sheet. The newer updatedAt wins.
  applyRemote(changes) {
    let applied = 0;
    for (const table of TABLES) {
      for (const incoming of changes[table] || []) {
        if (!incoming || !incoming.id) continue;
        const { rev, ...rec } = incoming;
        const ts = Number(rec.updatedAt) || 0;
        const cur = this.t[table].get(rec.id);
        if (!cur || ts > cur.updatedAt) {
          this._write(table, { ...rec, updatedAt: ts, deleted: !!rec.deleted, _dirty: false, _synced: true });
          applied++;
        } else if (ts === cur.updatedAt && (cur._dirty || !cur._synced)) {
          this._write(table, { ...cur, _dirty: false, _synced: true });
        }
      }
    }
    if (applied) this._emit();
    return applied;
  }

  // Used when a new sheet is connected, so everything gets pushed to it.
  markAllDirty() {
    for (const table of TABLES) {
      for (const r of this.t[table].values()) {
        if (!r._dirty) this._write(table, { ...r, _dirty: true });
      }
    }
  }

  // ---- Backup ----

  exportData() {
    const tables = {};
    for (const name of TABLES) tables[name] = [...this.t[name].values()].map(clean);
    return { app: 'trakr', version: 1, exportedAt: new Date().toISOString(), tables };
  }

  // Merges a backup into the current data. Newer records win, like a sync.
  importData(data) {
    if (!data || data.app !== 'trakr' || !data.tables) throw new Error('This file is not a trakr backup.');
    let count = 0;
    this.batch(() => {
      for (const table of TABLES) {
        for (const rec of data.tables[table] || []) {
          if (!rec || !rec.id) continue;
          const cur = this.t[table].get(rec.id);
          const ts = Number(rec.updatedAt) || 0;
          if (cur && ts <= cur.updatedAt) continue;
          this._write(table, { ...clean(rec), updatedAt: ts, deleted: !!rec.deleted, _dirty: true, _synced: !!(cur && cur._synced) });
          count++;
        }
      }
      if (count) this._emit();
    });
    if (count) this._changed();
    return count;
  }

  async clearAll() {
    for (const name of TABLES) this.t[name].clear();
    this._cache = {};
    await this.p.clear();
    this._emit();
  }
}
