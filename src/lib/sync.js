// Sync with the Google Sheet through the Apps Script web app.
//
// One request does both directions. The app sends its changed records plus the
// last revision number it saw. The script stores the records, then returns every
// row that changed after that revision. Conflicts resolve by newest updatedAt.

// Apps Script web apps accept cross-origin POSTs only as "simple" requests, so
// the JSON body goes out as text/plain. The script URL answers with a redirect
// that fetch follows on its own.
export async function httpTransport(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`The script answered with HTTP ${res.status}.`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('The URL did not answer with trakr data. Check that the deployment gives access to "Anyone".');
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch (err) {
    return null;
  }
}

export class Sync {
  constructor(store, { transport = httpTransport, storage = browserStorage(), key = 'trakr.sync' } = {}) {
    this.store = store;
    this.transport = transport;
    this.storage = storage;
    this.key = key;
    this.cfg = { url: '', secret: '', lastRev: 0, lastSyncAt: 0 };
    try {
      const saved = storage && JSON.parse(storage.getItem(key) || 'null');
      if (saved) Object.assign(this.cfg, saved);
    } catch (err) {
      // A broken saved config is treated as "not connected".
    }
    this.state = { status: this.cfg.url ? 'idle' : 'off', error: '' };
    this.listeners = new Set();
    this.running = null;
    this.again = false;
    this.timer = null;
  }

  get configured() {
    return !!this.cfg.url;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _set(state) {
    this.state = state;
    for (const fn of [...this.listeners]) fn();
  }

  _save() {
    try {
      if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.cfg));
    } catch (err) {
      // Storage can be full or blocked. Sync still works for this session.
    }
  }

  // Connecting to a different sheet starts over: everything local is pushed to it.
  configure({ url, secret }) {
    url = (url || '').trim();
    secret = (secret || '').trim();
    if (url !== this.cfg.url) this.reset(false);
    this.cfg.url = url;
    this.cfg.secret = secret;
    this._save();
    this._set({ status: url ? 'idle' : 'off', error: '' });
  }

  // Forget what was synced so the next sync sends and fetches everything.
  reset(save = true) {
    this.cfg.lastRev = 0;
    this.cfg.lastSyncAt = 0;
    this.store.markAllDirty();
    if (save) this._save();
  }

  // onlyIfDirty skips the request when there is nothing to send. Edits to a
  // workout in progress stay local, so they should not trigger a request each.
  schedule(delay = 2500, onlyIfDirty = false) {
    if (!this.configured) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (onlyIfDirty && !this.store.dirtySnapshot().count) return;
      this.syncNow().catch(() => {});
    }, delay);
  }

  syncNow() {
    if (!this.configured) return Promise.resolve(false);
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this._run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(500);
      }
    });
    return this.running;
  }

  async _run() {
    this._set({ status: 'syncing', error: '' });
    try {
      const snap = this.store.dirtySnapshot();
      const res = await this.transport(this.cfg.url, { secret: this.cfg.secret, since: this.cfg.lastRev, changes: snap.changes });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Sync failed.');
      this.store.applyRemote(res.changes || {});
      this.store.markClean(snap.changes);
      this.cfg.lastRev = Number(res.rev) || 0;
      this.cfg.lastSyncAt = Date.now();
      this._save();
      this._set({ status: 'idle', error: '' });
      return true;
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      this._set({ status: offline ? 'offline' : 'error', error: offline ? '' : err.message || String(err) });
      throw err;
    }
  }

  // Sync shortly after any local change, when the app comes back to the
  // foreground, and when the connection returns.
  start() {
    this.store.onLocalChange = () => this.schedule(2500, true);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.schedule(300));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.schedule(300);
      });
    }
    this.schedule(300);
  }
}
