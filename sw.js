// Service worker: makes trakr load without a connection.
//
// On install it stores every file of the app. After that, requests are answered
// from that store right away, and a fresh copy is fetched in the background for
// next time. So after you publish a change, the first load still shows the old
// version and the second load shows the new one.
//
// A new source file must be added to ASSETS. tools/test.html has a test that
// fails when one is missing.

const VERSION = 'trakr-v1';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'vendor/preact-htm.js',
  'src/main.js',
  'src/app.js',
  'src/deps.js',
  'src/lib/actions.js',
  'src/lib/calc.js',
  'src/lib/db.js',
  'src/lib/idb.js',
  'src/lib/seed.js',
  'src/lib/store.js',
  'src/lib/sync.js',
  'src/lib/units.js',
  'src/lib/util.js',
  'src/screens/body.js',
  'src/screens/settings.js',
  'src/screens/today.js',
  'src/screens/training.js',
  'src/screens/workout.js',
  'src/ui/charts.js',
  'src/ui/hooks.js',
  'src/ui/icon.js',
  'src/ui/nav.js',
  'src/ui/parts.js',
  'src/ui/router.js',
  'src/ui/sections.js',
  'apps-script/Code.gs',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // Sync requests to the sheet are POSTs and go straight to the network.
  const url = new URL(request.url);
  const own = url.origin === self.location.origin;
  if (!own && !FONT_HOSTS.includes(url.hostname)) return;
  event.respondWith(cachedThenRefreshed(request, own));
});

async function cachedThenRefreshed(request, own) {
  const cache = await caches.open(VERSION);
  // Page loads may carry a query string such as ?sw=1. They all map to the same files.
  const cached = await cache.match(request, { ignoreSearch: own });
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const fresh = await refresh;
  if (fresh) return fresh;
  // Offline and not stored: fall back to the app shell for page loads.
  if (request.mode === 'navigate') {
    const shell = await cache.match('index.html');
    if (shell) return shell;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}
