import { App } from './app.js';
import { html, render } from './deps.js';
import { initDb } from './lib/db.js';

initDb().then(() => {
  render(html`<${App} />`, document.getElementById('app'));
});

// The service worker makes the app load offline. On localhost it stays off
// unless the URL has ?sw=1, so code edits are never hidden behind a cache.
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!local || new URLSearchParams(location.search).has('sw'))) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('trakr: offline support is unavailable', err));
  });
}
