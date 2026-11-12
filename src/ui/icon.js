import { html } from '../deps.js';

// Line icons on a 24px grid. Each entry is a function so every use gets fresh nodes.
const PATHS = {
  home: () => html`<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />`,
  body: () => html`<rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M8.5 9.5a5 5 0 0 1 7 0" /><path d="M12 9v3" />`,
  dumbbell: () => html`<path d="M7 6.5v11M4 9v6M17 6.5v11M20 9v6M7 12h10" />`,
  settings: () => html`<path d="M4 8h9M19 8h1M4 16h1M11 16h9" /><circle cx="16" cy="8" r="2.5" /><circle cx="8" cy="16" r="2.5" />`,
  cloudCheck: () => html`<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /><path d="m9.5 13.5 2 2 3.5-4" />`,
  cloudOff: () => html`<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /><path d="m10 12 4 4M14 12l-4 4" />`,
  refresh: () => html`<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9" /><path d="M18.5 3.5v4h-4M5.5 20.5v-4h4" />`,
  plus: () => html`<path d="M12 5v14M5 12h14" />`,
  minus: () => html`<path d="M5 12h14" />`,
  check: () => html`<path d="m5 12.5 4.5 4.5L19 7.5" />`,
  x: () => html`<path d="M6 6l12 12M18 6 6 18" />`,
  chevronRight: () => html`<path d="m9 6 6 6-6 6" />`,
  chevronDown: () => html`<path d="m6 9 6 6 6-6" />`,
  arrowLeft: () => html`<path d="M19 12H5M11 6l-6 6 6 6" />`,
  arrowRight: () => html`<path d="M5 12h14M13 6l6 6-6 6" />`,
  arrowUp: () => html`<path d="M12 19V5M6 11l6-6 6 6" />`,
  arrowDown: () => html`<path d="M12 5v14M6 13l6 6 6-6" />`,
  trendDown: () => html`<path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" />`,
  trendUp: () => html`<path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" />`,
  clock: () => html`<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />`,
  ruler: () => html`<rect x="2" y="8" width="20" height="8" rx="2" /><path d="M6 8v3M10 8v4M14 8v3M18 8v4" />`,
  star: () => html`<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />`,
  target: () => html`<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" />`,
  pencil: () => html`<path d="M4 20h4L19.5 8.5l-4-4L4 16z" />`,
  trash: () => html`<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />`,
  list: () => html`<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />`,
  more: () => html`<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />`,
  search: () => html`<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />`,
  download: () => html`<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />`,
  upload: () => html`<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" />`,
  copy: () => html`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M5 15.5V7a2.5 2.5 0 0 1 2.5-2.5H15" />`,
};

export function Icon({ name, size = 20, sw = 2, filled = false }) {
  const draw = PATHS[name];
  return html`<svg
    class="icon"
    aria-hidden="true"
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill=${filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width=${sw}
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${draw ? draw() : null}
  </svg>`;
}
