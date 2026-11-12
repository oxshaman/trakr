// Persistence backends for the store. IndexedDB in the app, memory in tests
// and when the browser blocks storage.

export class MemoryPersistence {
  async loadAll() {
    return {};
  }
  putMany() {}
  deleteMany() {}
  async clear() {}
}

export class IdbPersistence {
  constructor(tables, name = 'trakr') {
    this.tables = tables;
    this.name = name;
    this.opening = null;
    this.queue = [];
    this.scheduled = false;
  }

  open() {
    if (!this.opening) {
      this.opening = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          for (const t of this.tables) {
            if (!req.result.objectStoreNames.contains(t)) req.result.createObjectStore(t, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
      });
    }
    return this.opening;
  }

  async loadAll() {
    const idb = await this.open();
    const out = {};
    await Promise.all(
      this.tables.map(
        (t) =>
          new Promise((resolve, reject) => {
            const req = idb.transaction(t).objectStore(t).getAll();
            req.onsuccess = () => {
              out[t] = req.result;
              resolve();
            };
            req.onerror = () => reject(req.error);
          }),
      ),
    );
    return out;
  }

  // Writes are queued and saved together in one transaction right after the
  // current task. A workout that touches 30 records is one disk write, and a
  // big import or first sync does not open thousands of transactions.
  // The in-memory copy is what the UI reads, so nothing waits on this.
  putMany(table, recs) {
    for (const r of recs) this.queue.push(['put', table, r]);
    this.schedule();
  }

  deleteMany(table, ids) {
    for (const id of ids) this.queue.push(['delete', table, id]);
    this.schedule();
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  flush() {
    this.scheduled = false;
    const ops = this.queue;
    this.queue = [];
    if (!ops.length) return;
    const tables = [...new Set(ops.map((op) => op[1]))];
    this.open()
      .then((idb) => {
        const tx = idb.transaction(tables, 'readwrite');
        for (const [kind, table, value] of ops) {
          if (kind === 'put') tx.objectStore(table).put(value);
          else tx.objectStore(table).delete(value);
        }
        tx.onabort = () => console.warn('trakr: a save did not complete', tx.error);
      })
      .catch((err) => console.warn('trakr: could not save', err));
  }

  async clear() {
    const idb = await this.open();
    await Promise.all(
      this.tables.map(
        (t) =>
          new Promise((resolve, reject) => {
            const req = idb.transaction(t, 'readwrite').objectStore(t).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          }),
      ),
    );
  }
}
