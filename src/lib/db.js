// The app's single store and sync engine.

import { IdbPersistence, MemoryPersistence } from './idb.js';
import { seed } from './seed.js';
import { Store, TABLES } from './store.js';
import { Sync } from './sync.js';

export const db = new Store(new IdbPersistence(TABLES));
export const sync = new Sync(db);

export async function initDb() {
  try {
    await db.load();
  } catch (err) {
    console.warn('trakr: storage is unavailable, data will not survive a reload', err);
    db.p = new MemoryPersistence();
  }
  seed(db);
  sync.start();
}
