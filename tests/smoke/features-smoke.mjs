// Feature smoke test (recurring items, voice add, background expiry check, ...).
// Usage: node tests/smoke/features-smoke.mjs <url> [width] [el|en] [screenshotDir]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 1280);
const lang = process.argv[4] || 'el';
const shots = process.argv[5];
const en = lang === 'en';
const L = (el, english) => (en ? english : el);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['notifications']);
const page = await browser.newPage();
await page.setViewport({ width, height: 900 });
await page.evaluateOnNewDocument((lang) => {
  Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') });
  // Fake speech recognition: "hears" a fixed phrase.
  window.__speech = lang === 'en' ? 'bread and 2 eggs' : 'ψωμί και 2 αυγά';
  window.SpeechRecognition = class { start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: window.__speech }]] }); this.onend?.(); }, 50); } stop() { this.onend?.(); } };
  window.__notifications = [];
  if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = (title, o) => { window.__notifications.push({ title, body: o?.body }); return Promise.resolve(); };
}, lang);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`http ${r.status()} ${r.url()}`); });
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1') || '{}'));
async function tap(selector) { await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(250); await page.click(selector); }
async function nav(view) { await page.click(`.nav-item[data-view="${view}"]`); await wait(); }
async function check(name, fn) {
  try { const ok = await fn(); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
}
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/feature-${name}-${lang}${width < 700 ? '-phone' : ''}.png`, fullPage: true }); };
const greekLeft = async () => en ? (await page.evaluate(() => window.__i18n.untranslatedGreek())).filter((s) => !/Γάλα|Ψωμί|Αυγά|Μήλα|Ρύζι|Γιαούρτι|Ελαιόλαδο|Ντομάτες|Φέτα|Κοτόπουλο|Πατάτες/.test(s)) : [];

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'networkidle0' });

await check('language as expected', async () => (await page.evaluate(() => document.documentElement.lang)) === lang);

await check('recurring item goes on the list immediately and once', async () => {
  await nav('shopping');
  await page.type('#recurring-form input[name=name]', L('Γάλα', 'Milk'));
  await page.select('#recurring-form select[name=everyDays]', '7');
  await tap('#recurring-form button[type=submit]'); await wait();
  const s = await stored();
  const rows = await page.$$eval('.shopping-row', (els) => els.map((e) => e.textContent));
  await page.reload({ waitUntil: 'networkidle0' }); await wait();
  const after = await stored();
  return s.recurring?.length === 1 && rows.length === 1 && rows[0].includes(L('Γάλα', 'Milk')) && after.shopping.length === 1
    && (await page.$$('.recurring-row')).length === 1;
});

await check('removing recurring rule keeps the list row', async () => {
  await tap('[data-action="remove-recurring"]'); await wait();
  const s = await stored();
  return s.recurring.length === 0 && s.shopping.length === 1;
});

await check('voice add parses several items', async () => {
  await tap('[data-action="voice-add"]'); await wait(600);
  const s = await stored();
  const names = s.shopping.map((r) => r.name);
  return names.includes(L('Ψωμί', 'Bread')) && s.shopping.find((r) => r.name === L('Αυγά', 'Eggs'))?.quantity === 2;
});
await shot('recurring-voice');

await check('voice button hidden without Speech API', async () => {
  const p2 = await browser.newPage();
  await p2.evaluateOnNewDocument(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined }); });
  await p2.goto(`${url.replace(/#.*$/, '')}#shopping`, { waitUntil: 'networkidle0' }); await wait();
  const has = await p2.$('[data-action="voice-add"]');
  await p2.close();
  return has === null;
});

await check('notifications: background snapshot written and SW check notifies once', async () => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1'));
    const d = new Date(); d.setDate(d.getDate() + 1);
    st.items.push({ id: 'n1', name: 'Γιαούρτι', quantity: 1, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('settings');
  await tap('[data-action="enable-notifications"]'); await wait(1000);
  const appNotified = await page.evaluate(() => window.__notifications.length);
  const snap = await page.evaluate(async () => { const r = await (await caches.open('spitothiki-data')).match('./__expiry.json'); return r ? r.json() : null; });
  const hint = await page.$eval('#notify-background', (e) => e.textContent);
  return appNotified === 1 && snap?.items?.some((i) => i.name === 'Γιαούρτι') && snap.lastNotified && snap.lang === lang && hint.length > 10;
});
await check('service worker background check function runs without error', async () => {
  // Reset the shared "notified today" flag and ask the SW to run its periodic-sync handler.
  await page.evaluate(async () => {
    const cache = await caches.open('spitothiki-data');
    const snap = await (await cache.match('./__expiry.json')).json();
    snap.lastNotified = '';
    await cache.put('./__expiry.json', new Response(JSON.stringify(snap)));
    (await navigator.serviceWorker.ready).active.postMessage('spitothiki-expiry-check');
  });
  await wait(1200);
  const snap = await page.evaluate(async () => (await (await caches.open('spitothiki-data')).match('./__expiry.json')).json());
  return Boolean(snap.lastNotified);
});
await shot('notifications');

for (const view of ['shopping', 'settings']) await check(`no Greek UI left on ${view} (${lang})`, async () => { await nav(view); const left = await greekLeft(); if (left.length) console.log('  left:', left); return !left.length; });

console.log(`features ${width} ${lang}: ${errors.length ? 'FAILED ' + JSON.stringify(errors) : 'passed'}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
