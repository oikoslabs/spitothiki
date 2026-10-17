// Service worker for offline use.
// Strategy: network-first for everything from this site (HTML, JS, CSS, manifest), so a new
// deploy shows up on the next load; the cache is only used when the network is unavailable.
// Bump CACHE_VERSION when the list of shell files changes; old caches are deleted on activate.
const CACHE_VERSION = 'v7';
const CACHE = `spitothiki-${CACHE_VERSION}`;
const DATA_CACHE = 'spitothiki-data'; // written by the app: expiry snapshot for background checks
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './src/app.js', './src/i18n.js', './src/features.js', './src/domain.js', './src/storage.js', './src/barcode.js', './src/firebase-config.js', './src/sync-core.js', './src/sync-firebase.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('spitothiki-') && key !== CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))))
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

// Periodic Background Sync (Chromium, installed app): daily-ish expiry check without opening the app.
// Reads the snapshot the app keeps in the data cache; notifies at most once per day (shared with the app).
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDaysKey(key, days) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); }
async function backgroundExpiryCheck() {
  const cache = await caches.open(DATA_CACHE);
  const res = await cache.match('./__expiry.json');
  if (!res) return;
  const snap = await res.json();
  const today = todayKey();
  if (snap.lastNotified === today) return;
  const limit = addDaysKey(today, Number(snap.days ?? 3));
  const due = (snap.items || []).filter((i) => i.expiry >= today && i.expiry <= limit).sort((a, b) => a.expiry.localeCompare(b.expiry));
  if (!due.length) return;
  const title = due.length === 1 ? snap.titleOne : String(snap.titleMany).replace('{count}', due.length);
  const more = due.length > 3 ? String(snap.more).replace('{count}', due.length - 3) : '';
  await self.registration.showNotification(title, { body: `${due.slice(0, 3).map((i) => i.name).join(', ')}${more}.`, tag: 'spitothiki-expiry', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: snap.lang || 'el' });
  snap.lastNotified = today;
  await cache.put('./__expiry.json', new Response(JSON.stringify(snap), { headers: { 'content-type': 'application/json' } }));
}
self.addEventListener('periodicsync', (event) => { if (event.tag === 'spitothiki-expiry') event.waitUntil(backgroundExpiryCheck()); });
self.addEventListener('message', (event) => { if (event.data === 'spitothiki-expiry-check') event.waitUntil?.(backgroundExpiryCheck()); });
