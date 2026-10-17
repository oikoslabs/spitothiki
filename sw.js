// Service worker for offline use.
// Strategy: network-first for everything from this site (HTML, JS, CSS, manifest), so a new
// deploy shows up on the next load; the cache is only used when the network is unavailable.
// Bump CACHE_VERSION when the list of shell files changes; old caches are deleted on activate.
const CACHE_VERSION = 'v5';
const CACHE = `spitothiki-${CACHE_VERSION}`;
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './src/app.js', './src/domain.js', './src/storage.js', './src/barcode.js', './src/firebase-config.js', './src/sync-core.js', './src/sync-firebase.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('spitothiki-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      // no-cache: always revalidate with the server, bypassing the browser HTTP cache.
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});

// Clicking an expiry notification focuses the app (or opens it) on the pantry screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) { await existing.focus(); return existing.navigate(`${self.registration.scope}#pantry`).catch(() => {}); }
    return self.clients.openWindow(`${self.registration.scope}#pantry`);
  })());
});
