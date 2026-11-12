// Small building blocks shared by every screen.

import { html, useEffect, useState } from '../deps.js';
import { parseNum } from '../lib/util.js';
import { useSync } from './hooks.js';
import { Icon } from './icon.js';
import { back, go } from './router.js';

// Screen header. With backTo it shows a back button and a smaller title.
export function Head({ title, sub, backTo, children }) {
  const sub2 = backTo !== undefined;
  return html`
    <header class="head rise">
      <div class="head-main">
        ${sub2 &&
        html`<button class="icon-btn" aria-label="Back" onClick=${() => back(backTo)}><${Icon} name="arrowLeft" /></button>`}
        <div class="head-titles">
          ${sub && html`<span class="head-sub">${sub}</span>`}
          <h1 class=${sub2 ? 'h1 h1-sm' : 'h1'}>${title}</h1>
        </div>
      </div>
      <div class="head-actions">${children}</div>
    </header>
  `;
}

// Bottom sheet on a phone, centered dialog on a wide screen.
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, []);
  return html`
    <div class="sheet-wrap" onClick=${onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h2 class="h2">${title}</h2>
          <button class="icon-btn" aria-label="Close" onClick=${onClose}><${Icon} name="x" /></button>
        </div>
        ${children}
      </div>
    </div>
  `;
}

// A number field that keeps what you type while it has focus and saves on blur.
// Saving on every keystroke would turn "62." back into "62" mid-typing.
export function NumInput({ value, placeholder, label, onCommit, cls = 'input', inputRef, id }) {
  const [text, setText] = useState(null);
  const shown = text !== null ? text : value === undefined || value === null ? '' : String(value);
  const commit = () => {
    if (text === null) return;
    const next = parseNum(text);
    setText(null);
    const cur = value === undefined || value === null || value === '' ? undefined : Number(value);
    if (next !== cur) onCommit(next);
  };
  return html`<input
    id=${id}
    ref=${inputRef}
    class=${cls}
    type="text"
    inputmode="decimal"
    autocomplete="off"
    enterkeyhint="done"
    aria-label=${label}
    placeholder=${placeholder === undefined ? '' : placeholder}
    value=${shown}
    onFocus=${(e) => {
      setText(shown);
      e.target.select();
    }}
    onInput=${(e) => setText(e.target.value)}
    onBlur=${commit}
    onKeyDown=${(e) => {
      if (e.key === 'Enter') e.target.blur();
    }}
  />`;
}

// A text field that saves on blur or Enter.
export function TextInput({ value, onCommit, label, placeholder, type = 'text', cls = 'input' }) {
  const [text, setText] = useState(null);
  const shown = text !== null ? text : value || '';
  const commit = () => {
    if (text === null) return;
    const next = text.trim();
    setText(null);
    if (next !== (value || '')) onCommit(next);
  };
  return html`<input
    class=${cls}
    type=${type}
    autocomplete="off"
    autocapitalize="off"
    spellcheck=${false}
    aria-label=${label}
    placeholder=${placeholder || ''}
    value=${shown}
    onFocus=${() => setText(shown)}
    onInput=${(e) => setText(e.target.value)}
    onBlur=${commit}
    onKeyDown=${(e) => {
      if (e.key === 'Enter') e.target.blur();
    }}
  />`;
}

// A row of options where one is selected.
export function Segmented({ options, value, onChange, label }) {
  return html`
    <div class="segmented" role="group" aria-label=${label}>
      ${options.map(
        (o) =>
          html`<button key=${o.value} class=${'seg' + (o.value === value ? ' on' : '')} aria-pressed=${o.value === value} onClick=${() => onChange(o.value)}>
            ${o.label}
          </button>`,
      )}
    </div>
  `;
}

// ---- Toasts ----

let toasts = [];
let nextToast = 1;
const toastSubs = new Set();
const notify = () => toastSubs.forEach((fn) => fn());

export function toast(text) {
  const id = nextToast++;
  toasts = [...toasts, { id, text }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 2600);
}

export function Toasts() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    toastSubs.add(fn);
    return () => toastSubs.delete(fn);
  }, []);
  return html`<div class="toasts" aria-live="polite">${toasts.map((t) => html`<div class="toast" key=${t.id}>${t.text}</div>`)}</div>`;
}

// ---- Sync status ----

export function syncLabel(status) {
  if (status === 'off') return 'Sync is not set up';
  if (status === 'syncing') return 'Syncing';
  if (status === 'error') return 'Sync failed';
  if (status === 'offline') return 'Offline';
  return 'Synced';
}

export const syncIcon = (status) => (status === 'syncing' ? 'refresh' : status === 'idle' ? 'cloudCheck' : 'cloudOff');

export function runSync(sync) {
  if (sync.state.status === 'off') {
    go('/settings');
    return;
  }
  sync
    .syncNow()
    .then(() => toast('Synced with your sheet'))
    .catch((err) => toast(sync.state.status === 'offline' ? 'Offline. Changes will sync later.' : `Sync failed: ${err.message}`));
}

export function SyncButton() {
  const sync = useSync();
  const status = sync.state.status;
  const label = status === 'off' ? 'Sync is not set up. Open settings.' : `${syncLabel(status)}. Sync now.`;
  return html`<button class=${'icon-btn sync-' + status} aria-label=${label} title=${label} onClick=${() => runSync(sync)}>
    <${Icon} name=${syncIcon(status)} />
  </button>`;
}
