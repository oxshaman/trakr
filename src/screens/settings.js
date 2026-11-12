import { html, useEffect, useRef, useState } from '../deps.js';
import * as act from '../lib/actions.js';
import { db } from '../lib/db.js';
import { MEASUREMENT_TYPES } from '../lib/seed.js';
import { fromW, toW, wUnit } from '../lib/units.js';
import { fix1, relTime, today } from '../lib/util.js';
import { useNow, useSync } from '../ui/hooks.js';
import { Icon } from '../ui/icon.js';
import { Head, NumInput, Segmented, TextInput, runSync, syncLabel, toast } from '../ui/parts.js';

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

function readTheme() {
  try {
    return localStorage.getItem('trakr.theme') || 'system';
  } catch (err) {
    return 'system';
  }
}

function SyncSection() {
  const sync = useSync();
  const now = useNow(true, 30000);
  const [url, setUrl] = useState(sync.cfg.url);
  const [secret, setSecret] = useState(sync.cfg.secret);
  const [script, setScript] = useState('');
  const status = sync.state.status;
  const changed = url.trim() !== sync.cfg.url || secret.trim() !== sync.cfg.secret;

  // Loaded up front so "Copy the script" can write to the clipboard right on the tap.
  useEffect(() => {
    fetch('apps-script/Code.gs')
      .then((r) => (r.ok ? r.text() : ''))
      .then(setScript)
      .catch(() => {});
  }, []);

  const connect = () => {
    const u = url.trim();
    if (u && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) {
      toast('That does not look like a web app URL. It starts with https://script.google.com and ends with /exec.');
      return;
    }
    sync.configure({ url: u, secret });
    if (u) runSync(sync);
    else toast('Sync turned off');
  };

  const copy = () => {
    if (!script || !navigator.clipboard) {
      window.open('apps-script/Code.gs', '_blank');
      return;
    }
    navigator.clipboard.writeText(script).then(
      () => toast('Script copied. Paste it into the Apps Script editor.'),
      () => window.open('apps-script/Code.gs', '_blank'),
    );
  };

  const resend = () => {
    if (!window.confirm('Send all data from this device to the sheet again? Use this after clearing or replacing the sheet.')) return;
    sync.reset();
    runSync(sync);
  };

  const line =
    status === 'off'
      ? 'Not connected. Your data stays on this device only.'
      : status === 'error'
        ? `Sync failed: ${sync.state.error}`
        : status === 'offline'
          ? 'Offline. Changes are saved here and sync when the connection is back.'
          : status === 'syncing'
            ? 'Syncing'
            : sync.cfg.lastSyncAt
              ? `Synced ${relTime(sync.cfg.lastSyncAt, now)}`
              : 'Connected. Not synced yet.';

  return html`
    <section class="section rise d2">
      <div class="section-head"><h2 class="h2">Google Sheet sync</h2></div>
      <p class=${'status-line s-' + status}><${Icon} name=${status === 'idle' ? 'cloudCheck' : status === 'syncing' ? 'refresh' : 'cloudOff'} size=${18} /><span>${line}</span></p>

      <details class="steps" open=${!sync.configured}>
        <summary>How to set it up</summary>
        <ol>
          <li>Create a new Google Sheet.</li>
          <li>In the sheet, open Extensions, then Apps Script.</li>
          <li>
            Replace everything in the editor with the trakr script.
            <button class="btn sm soft" onClick=${copy}><${Icon} name="copy" size=${16} /><span>Copy the script</span></button>
          </li>
          <li>Near the top of the script, change <code>SECRET</code> from <code>change-me</code> to a passphrase of your own.</li>
          <li>Click Deploy, then New deployment. Choose the type "Web app". Set "Execute as" to Me and "Who has access" to Anyone. Approve the permission prompt.</li>
          <li>Copy the web app URL. Paste the URL and your passphrase below.</li>
        </ol>
        <p class="help">The URL and the passphrase together work like a password to that sheet. Keep them to yourself. To use a second device, enter the same two values there.</p>
      </details>

      <label class="field">
        <span class="field-label">Web app URL</span>
        <input class="input" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck=${false} placeholder="https://script.google.com/macros/s/…/exec" value=${url} onInput=${(e) => setUrl(e.target.value)} />
      </label>
      <label class="field">
        <span class="field-label">Passphrase (the SECRET in the script)</span>
        <input class="input" type="password" autocomplete="off" value=${secret} onInput=${(e) => setSecret(e.target.value)} />
      </label>
      <div class="form-actions">
        ${sync.configured && !changed
          ? html`<button class="btn ink wide" onClick=${() => runSync(sync)} disabled=${status === 'syncing'}><${Icon} name="refresh" size=${18} /><span>Sync now</span></button>`
          : html`<button class="btn ink wide" onClick=${connect} disabled=${!changed}>${!url.trim() && sync.configured ? 'Turn sync off' : 'Connect and sync'}</button>`}
      </div>
      ${sync.configured && html`<button class="link-btn" onClick=${resend}>Send everything to the sheet again</button>`}
    </section>
  `;
}

function BackupSection() {
  const fileRef = useRef(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trakr-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const count = db.importData(JSON.parse(await file.text()));
      toast(count ? `Imported ${count} record${count === 1 ? '' : 's'}` : 'Nothing new in that file');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message);
    }
  };

  return html`
    <section class="section rise d3">
      <div class="section-head"><h2 class="h2">Backup</h2></div>
      <p class="help">Export saves everything on this device to a file. Import merges a file back in and keeps the newer version of each record.</p>
      <div class="form-actions">
        <button class="btn soft wide" onClick=${exportData}><${Icon} name="download" size=${18} /><span>Export</span></button>
        <button class="btn soft wide" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} name="upload" size=${18} /><span>Import</span></button>
        <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${importData} />
      </div>
    </section>
  `;
}

export function Settings() {
  const sys = act.units();
  const unit = wUnit(sys);
  const goal = act.goalKg();
  const tracked = act.trackedMeasurements();
  const [theme, setTheme] = useState(readTheme);

  const changeTheme = (t) => {
    setTheme(t);
    try {
      if (t === 'system') localStorage.removeItem('trakr.theme');
      else localStorage.setItem('trakr.theme', t);
    } catch (err) {
      // The theme still applies for this visit.
    }
    applyTheme(t);
  };

  const toggle = (type) => {
    const next = tracked.includes(type) ? tracked.filter((t) => t !== type) : MEASUREMENT_TYPES.map((m) => m.id).filter((t) => t === type || tracked.includes(t));
    db.setSetting('measurements', JSON.stringify(next));
  };

  return html`
    <div class="screen narrow">
      <${Head} title="Settings" backTo="/" />

      <section class="section rise d1">
        <div class="field">
          <span class="field-label">Units</span>
          <${Segmented}
            label="Units"
            value=${sys}
            onChange=${(v) => db.setSetting('units', v)}
            options=${[
              { value: 'metric', label: 'kg and cm' },
              { value: 'imperial', label: 'lb and in' },
            ]}
          />
        </div>
        <label class="field">
          <span class="field-label">Goal weight (${unit})</span>
          <${NumInput}
            label=${`Goal weight in ${unit}`}
            value=${goal ? fix1(toW(goal, sys)) : undefined}
            placeholder="None"
            onCommit=${(n) => db.setSetting('goalKg', n && n > 0 ? fromW(n, sys) : '')}
          />
        </label>
        <div class="field">
          <span class="field-label">Theme</span>
          <${Segmented}
            label="Theme"
            value=${theme}
            onChange=${changeTheme}
            options=${[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <div class="field">
          <span class="field-label">Measurements to track</span>
          <div class="toggles">
            ${MEASUREMENT_TYPES.map(
              (m) => html`
                <button key=${m.id} class=${'toggle-chip' + (tracked.includes(m.id) ? ' on' : '')} aria-pressed=${tracked.includes(m.id) ? 'true' : 'false'} onClick=${() => toggle(m.id)}>
                  ${tracked.includes(m.id) && html`<${Icon} name="check" size=${14} sw=${3} />`}
                  <span>${m.name}</span>
                </button>
              `,
            )}
          </div>
        </div>
      </section>

      <${SyncSection} />
      <${BackupSection} />

      <p class="help center">trakr keeps your data on this device and, when connected, in your own Google Sheet.</p>
    </div>
  `;
}
