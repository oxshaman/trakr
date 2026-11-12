import { html } from '../deps.js';
import { relTime } from '../lib/util.js';
import { useNow, useSync } from './hooks.js';
import { Icon } from './icon.js';
import { runSync, syncIcon, syncLabel } from './parts.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'home', href: '#/' },
  { id: 'body', label: 'Body', icon: 'body', href: '#/body' },
  { id: 'training', label: 'Training', icon: 'dumbbell', href: '#/training' },
];

const link = (t, tab, cls) => html`
  <a key=${t.id} href=${t.href} class=${`${cls} t-${t.id}${tab === t.id ? ' active' : ''}`} aria-current=${tab === t.id ? 'page' : undefined}>
    <${Icon} name=${t.icon} />
    <span>${t.label}</span>
  </a>
`;

// Bottom bar on a phone.
export function TabBar({ tab }) {
  return html`<nav class="tabbar" aria-label="Main">${TABS.map((t) => link(t, tab, 'tab'))}</nav>`;
}

// Left column on a wide screen.
export function Sidebar({ tab }) {
  const sync = useSync();
  const status = sync.state.status;
  const now = useNow(true, 30000);
  const detail = status === 'idle' && sync.cfg.lastSyncAt ? `Synced ${relTime(sync.cfg.lastSyncAt, now)}` : syncLabel(status);
  const all = [...TABS, { id: 'settings', label: 'Settings', icon: 'settings', href: '#/settings' }];
  return html`
    <nav class="sidebar" aria-label="Main">
      <a class="brand" href="#/">
        <span class="brand-mark"><${Icon} name="dumbbell" size=${18} sw=${2.5} /></span>
        <span class="brand-name">trakr</span>
      </a>
      <div class="side-links">${all.map((t) => link(t, tab, 'side-link'))}</div>
      <button class=${'side-sync sync-' + status} onClick=${() => runSync(sync)}>
        <${Icon} name=${syncIcon(status)} size=${16} />
        <span>${detail}</span>
      </button>
    </nav>
  `;
}
