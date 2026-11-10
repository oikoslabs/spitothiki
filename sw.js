// Service worker for offline use.
// Strategy (v1.9.12): cache-first for this site's files, so a repeat visit downloads almost nothing
// (Firebase Hosting never answers 304 for compressed files, so «network-first» re-downloaded the whole app
// on every open). A new deploy still shows up: the browser re-checks sw.js on every open, a new CACHE_VERSION
// installs a fresh copy of the shell, and the page reloads once on «controllerchange».
// Bump CACHE_VERSION on EVERY deploy that changes any app file; old caches are deleted on activate.
const CACHE_VERSION = 'v120';
const CACHE = `spitothiki-${CACHE_VERSION}`;
const OCR_CACHE = 'spitothiki-vendor'; // v1.9.4: was spitothiki-ocr (CDN copies), deleted on activate
const SHARE_CACHE = 'spitothiki-share'; // a file shared to the app (Web Share Target), picked up by the page // Tesseract.js script/worker/core/language files, kept across versions
const DATA_CACHE = 'spitothiki-data'; // written by the app: expiry snapshot for background checks
// v120: home «Οδηγός χρήσης» shortcut + tester invite until launch (cache bumped, app version stays 1.9.20 until release).
// v119: in-app user guide («Οδηγός») (cache bumped, app version stays 1.9.20 until release).
// v1.9.20: custom product types («Είδη προϊόντων») with emoji in Settings; deleted type falls back to «Άλλο» (cache bumped).
// v1.9.19: friendlier home + «Αρχική οθόνη» setting, safer receipt amount edit, two-step tester invite, honest QR onboarding (cache bumped).
// v1.9.18: optional product-news opt-in + privacy email section (cache bumped).
// v1.9.17: stop Google account picker opening on scroll (silent Drive + no email autofocus) (cache bumped).
// v1.9.16: block disposable/temp emails on email+password sign-up (cache bumped).
// v1.9.12: lighter: cache-first + no double download on first visit (cache bumped).
// v1.9.11: opt-in weekly scan reminder (cache bumped).
// v1.9.10: «Νέα» badge on recently added recipes (cache bumped).
// v1.9.9: visible version label was stuck at 1.9.4, now 1.9.9 (cache bumped).
// v1.8.9: Google Play app (TWA): /.well-known/assetlinks.json, source word 'play' (cache bumped).
// v1.9.0: first run (starter card, shorter onboarding, scan hint, sign-in next step), English leftovers (cache bumped).
// v1.9.1: friendlier starter card (cache bumped).
// v1.8.8: contact email on the privacy page and in Settings (cache bumped).
// v1.8.7: standalone /privacy.html (own page, also cached for offline) (cache bumped).
// v1.8.6: clearer names: «Είδος προϊόντος» (Γαλακτοκομικά…) vs «Κατηγορία εξόδου» (Αγορές, Ρούχα…) (cache bumped).
// v1.8.5: a scanned product shows its name (or «no details found») before «where should it go?» (cache bumped).
// v1.8.4: «Τι αγόρασες;» on a hand-typed expense (no new shell files; cache bumped so phones get the new code).
// v1.8.3: short links (/tiktok, /TikTok/ …). Online, Firebase Hosting redirects them; offline we do the same.
const SHORT_PATH = /^\/(tiktok|facebook|instagram|telegram|viber|reddit|pinterest|sofisstore|play)\/?$/i;
const SHELL = [
  './', './index.html', './privacy.html', './styles.css', './manifest.webmanifest',
  './src/app.js', './src/format.js', './src/theme.js', './src/i18n.js', './src/features.js', './src/recipes.js', './src/receipt.js', './src/receipt-photo.js', './src/mealplan.js', './src/diet-plan.js', './src/receipts.js', './src/diet-ui.js', './src/diet-i18n.js', './src/bills.js', './src/transport.js', './src/extras.js', './src/chores.js', './src/bar.js', './src/bill-pdf.js', './src/prefs.js', './src/scan-router.js', './src/onboarding.js', './src/cart.js', './src/shelf-price.js', './src/push.js', './src/auto-list.js', './src/price-compare.js', './src/recipe-data.js', './src/gs1.js', './src/back-to-top.js', './src/backup-crypto.js', './src/gdrive.js', './src/gdrive-auth.js', './src/drive-key.js', './src/receipt-edit.js', './src/manual-expense.js', './src/receipt-domains.js', './src/expense-cats.js', './src/whopaid.js', './src/offline.js', './src/protect.js', './src/domain.js', './src/storage.js', './src/barcode.js', './src/toll-barcode.js', './src/firebase-config.js', './src/sync-core.js', './src/sync-firebase.js', './src/disposable-email.js', './src/marketing-consent.js', './src/source.js', './src/account-delete.js', './src/tester-card.js', './src/home-actions.js', './src/product-types.js', './src/guide.js',
  './fonts/commissioner-greek.woff2', './fonts/commissioner-latin.woff2', './icons/icon-192.png', './icons/icon.svg'
];

// v1.9.12: first install takes the files the page just downloaded from the browser cache (short max-age in
// firebase.json) instead of downloading the app a second time; an update always fetches fresh copies.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const update = (await caches.keys()).some((key) => /^spitothiki-v\d+$/.test(key) && key !== CACHE);
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: update ? 'reload' : 'default' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('spitothiki-') && key !== CACHE && key !== DATA_CACHE && key !== OCR_CACHE && key !== SHARE_CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Web Share Target: a bill PDF/photo shared from another app (Android, installed PWA).
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await request.formData();
        const file = form.getAll('file').find((f) => f && typeof f === 'object' && f.size);
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put('./__shared-file', new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name || 'shared') } }));
        }
      } catch {}
      return Response.redirect('./?share=1#bills', 303);
    })());
    return;
  }
  // v1.9.4: self-hosted libraries under /vendor/<name>-<version>/ never change: cache-first, on demand
  // (not precached; Tesseract core + language data are ~8 MB and only load when OCR is used).
  if (request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/vendor/')) {
    event.respondWith(caches.open(OCR_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;
  event.respondWith((async () => {
    const navigate = request.mode === 'navigate';
    const short = navigate && url.pathname.match(SHORT_PATH);
    if (!short) {
      const cached = await caches.match(request, { ignoreSearch: navigate });
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' && !response.redirected) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch {
      if (short) return Response.redirect(`${self.location.origin}/?src=${short[1].toLowerCase()}`, 302);
      if (navigate) return (await caches.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});

// Clicking an expiry notification focuses the app (or opens it) on the pantry screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const view = event.notification.tag === 'spitothiki-bills' ? 'bills' : event.notification.tag === 'spitothiki-chores' ? 'chores' : ['spitothiki-push', 'spitothiki-scan'].includes(event.notification.tag) ? 'overview' : 'pantry';
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) { await existing.focus(); return existing.navigate(`${self.registration.scope}#${view}`).catch(() => {}); }
    return self.clients.openWindow(`${self.registration.scope}#${view}`);
  })());
});

// Periodic Background Sync (Chromium, installed app): daily-ish expiry check without opening the app.
// Reads the snapshot the app keeps in the data cache; notifies at most once per day (shared with the app).
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDaysKey(key, days) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); }
async function backgroundExpiryCheck({ force = false } = {}) {
  let shown = 0;
  const cache = await caches.open(DATA_CACHE);
  const res = await cache.match('./__expiry.json');
  if (!res) return 0;
  const snap = await res.json();
  const today = todayKey();
  const bills = (snap.bills || []).filter((b) => addDaysKey(today, Number(b.remind ?? 3)) >= b.due).sort((a, b) => a.due.localeCompare(b.due));
  if (bills.length && (force || snap.lastBillNotified !== today)) {
    shown += 1;
    const title = bills.length === 1 ? snap.billTitleOne : String(snap.billTitleMany).replace('{count}', bills.length);
    await self.registration.showNotification(title, { body: `${bills.slice(0, 3).map((b) => `${b.name} ${b.amount}`).join(', ')}.`, tag: 'spitothiki-bills', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: snap.lang || 'el' });
    snap.lastBillNotified = today;
    await cache.put('./__expiry.json', new Response(JSON.stringify(snap), { headers: { 'content-type': 'application/json' } }));
  }
  // v1.6.0: one chores reminder a day (due or late today), remembered apart from the snapshot so it never repeats.
  const choresDue = (snap.chores || []).filter((c) => c.next && c.next <= today);
  const choreMark = await cache.match('./__chores-notified');
  const choreLast = choreMark ? await choreMark.text() : '';
  if (choresDue.length && choreLast !== today) {
    shown += 1;
    await self.registration.showNotification(String(snap.choreTitle || 'Σήμερα: {list}').replace('{list}', choresDue.slice(0, 4).map((c) => c.name).join(', ') + (choresDue.length > 4 ? '…' : '')), { body: '', tag: 'spitothiki-chores', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: snap.lang || 'el' });
    await cache.put('./__chores-notified', new Response(today));
  } else if (choresDue.length && force) {
    // v1.6.11: the 9:00 push came but the app already showed today's chores: refresh the same notification quietly
    // (same tag, no sound) instead of a vague «Έχεις υπενθυμίσεις».
    shown += 1;
    await self.registration.showNotification(String(snap.choreTitle || 'Σήμερα: {list}').replace('{list}', choresDue.slice(0, 4).map((c) => c.name).join(', ') + (choresDue.length > 4 ? '…' : '')), { body: '', tag: 'spitothiki-chores', silent: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: snap.lang || 'el' });
  }
  if (snap.lastNotified === today && !force) return shown;
  const limit = addDaysKey(today, Number(snap.days ?? 3));
  const due = (snap.items || []).filter((i) => i.expiry >= today && i.expiry <= limit).sort((a, b) => a.expiry.localeCompare(b.expiry));
  if (!due.length) return shown;
  shown += 1;
  const title = due.length === 1 ? snap.titleOne : String(snap.titleMany).replace('{count}', due.length);
  const more = due.length > 3 ? String(snap.more).replace('{count}', due.length - 3) : '';
  await self.registration.showNotification(title, { body: `${due.slice(0, 3).map((i) => i.name).join(', ')}${more}.`, tag: 'spitothiki-expiry', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: snap.lang || 'el' });
  snap.lastNotified = today;
  await cache.put('./__expiry.json', new Response(JSON.stringify(snap), { headers: { 'content-type': 'application/json' } }));
  return shown;
}

// Push from the «spitothiki-push» Worker: an empty wake-up on a reminder date; the text is built from local data.
// Always shows a notification (Chrome penalises silent pushes), whatever fails on the way.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = 'Σπιτοθήκη'; let body = 'Άνοιξε για λεπτομέρειες.'; let tag = 'spitothiki-push';
    try {
      const data = await caches.open(DATA_CACHE);
      const test = await (await data.match('./__push-test.json'))?.json().catch(() => null);
      if (test && test.until > Date.now()) {
        await data.delete('./__push-test.json');
        return self.registration.showNotification(test.title || '✅ Οι ειδοποιήσεις λειτουργούν', { body: test.body || '', tag: 'spitothiki-test', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
      }
      if (await backgroundExpiryCheck({ force: true })) return;
      const snap = await (await data.match('./__expiry.json'))?.json().catch(() => null);
      // v1.9.11: opt-in scan nudge, only if nothing was scanned for 7 days.
      if (snap?.scanNudge && (!snap.lastScan || addDaysKey(snap.lastScan, 7) <= todayKey())) return self.registration.showNotification(snap.scanTitle || 'Σκάναρες τα ψώνια σου;', { body: snap.scanBody || '', tag: 'spitothiki-scan', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: snap.lang || 'el' });
      if (snap?.pushTitle) { title = snap.pushTitle; body = snap.pushBody || body; }
    } catch {}
    return self.registration.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  })());
});
self.addEventListener('periodicsync', (event) => { if (event.tag === 'spitothiki-expiry') event.waitUntil(backgroundExpiryCheck()); });
self.addEventListener('message', (event) => { if (event.data === 'spitothiki-expiry-check') event.waitUntil?.(backgroundExpiryCheck()); });
