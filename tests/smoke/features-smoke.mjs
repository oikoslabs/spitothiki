// Feature smoke test (recurring items, voice add, background expiry check, ...).
// Usage: node tests/smoke/features-smoke.mjs <url> [width] [el|en] [screenshotDir]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const RECEIPT = 'https://test-shop.epsilonnet.gr/fd/abc123:1';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 1280);
const lang = process.argv[4] || 'el';
const shots = process.argv[5];
const en = lang === 'en';
const L = (el, english) => (en ? english : el);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], headless: true });
await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['notifications', 'camera']);
const page = await browser.newPage();
await page.setViewport({ width, height: 900 });
await page.evaluateOnNewDocument((lang) => {
  Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') });
  // Fake speech recognition: "hears" a fixed phrase.
  window.__speech = lang === 'en' ? 'bread and 2 eggs' : 'ψωμί και 2 αυγά';
  window.SpeechRecognition = class { start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: window.__speech }]] }); this.onend?.(); }, 50); } stop() { this.onend?.(); } };
  // Fake QR detector: "sees" the receipt link on the (fake) camera.
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code', 'ean_13']; } constructor(o) { this.formats = o.formats; } async detect() { return this.formats.includes('qr_code') ? [{ rawValue: 'https://test-shop.epsilonnet.gr/fd/abc123:1' }] : []; } };
  window.__notifications = [];
  if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = (title, o) => { window.__notifications.push({ title, body: o?.body }); return Promise.resolve(); };
}, lang);
const errors = [];
// TheMealDB fixtures, so the test does not depend on the live API.
await page.setRequestInterception(true);
page.on('request', (request) => {
  const u = request.url();
  if (u.startsWith(RECEIPT)) {
    const body = u.endsWith('/myDATA') ? fixture('receipt-mydata.xml') : u.endsWith('/EN16931') ? fixture('receipt-ubl.xml') : '<html></html>';
    return request.respond({ status: 200, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' }, body });
  }
  if (u.startsWith('https://www.themealdb.com/api/')) {
    const body = u.includes('filter.php') ? { meals: [{ idMeal: '777', strMeal: 'Shakshuka', strMealThumb: 'https://www.themealdb.com/images/x.jpg' }] }
      : { meals: [{ idMeal: '777', strMeal: 'Shakshuka', strMealThumb: 'https://www.themealdb.com/images/x.jpg', strIngredient1: 'Eggs', strIngredient2: 'Tomatoes', strIngredient3: 'Cumin', strIngredient4: 'olive oil', strIngredient5: '' }] };
    return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  }
  if (u.startsWith('https://www.themealdb.com/images/')) return request.respond({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
  return request.continue();
});
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
const greekLeft = async () => en ? (await page.evaluate(() => window.__i18n.untranslatedGreek())).filter((s) => !/Γάλα|Ψωμί|Αυγά|Μήλα|Ρύζι|Γιαούρτι|Ελαιόλαδο|Ντομάτες|Φέτα|Κοτόπουλο|Πατάτες|Χαρτί|Πεκορίνο|ΔΟΚΙΜΑΣΤΙΚΟ|ΧΑΣΙΩΤΗ|Φακές με ρύζι|Χουρμαδες|Κασιους|Καρυδοψιχα|(aria-label|title)=(Import: |Decrease quantity of |Increase quantity of |Edit |Thrown away: |Delete )/.test(s)) : [];

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

await check('stores: create store, reorder aisles, list sorted by walking order', async () => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1'));
    st.shopping = [
      { id: 's-a', name: 'Χαρτί κουζίνας', quantity: 1, unit: 'τεμ.', checked: false, category: 'Καθαριότητα', createdAt: 'x' },
      { id: 's-b', name: 'Μήλα', quantity: 1, unit: 'κιλά', checked: false, category: 'Φρούτα & λαχανικά', createdAt: 'x' },
      { id: 's-c', name: 'Γάλα', quantity: 1, unit: 'λίτρα', checked: false, createdAt: 'x' }];
    st.items = [{ id: 'i-g', name: 'Γάλα', quantity: 0, unit: 'λίτρα', minimum: 1, category: 'Γαλακτοκομικά', location: '', expiry: '' }];
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('shopping');
  await tap('[data-action="toggle-stores"]'); await wait();
  await page.type('#store-form input[name=name]', 'Lidl');
  await tap('#store-form button[type=submit]'); await wait();
  // Move Cleaning up to the top: it starts 7th of 8.
  for (let i = 0; i < 6; i++) { await tap('[data-action="aisle-up"][data-category="Καθαριότητα"]'); await wait(150); }
  const order = await page.$$eval('.shopping-row-name', (els) => els.map((e) => e.textContent));
  const headings = await page.$$eval('.aisle-heading', (els) => els.map((e) => e.textContent));
  const s = await stored();
  await shot('stores');
  await tap('.store-bar [data-action="set-store"][data-store=""]'); await wait();
  const plain = await page.$$eval('.shopping-row-name', (els) => els.map((e) => e.textContent));
  await tap('.store-bar [data-action="set-store"]:not([data-store=""])'); await wait();
  return s.stores?.[0]?.name === 'Lidl' && s.stores[0].order[0] === 'Καθαριότητα'
    && JSON.stringify(order) === JSON.stringify(['Χαρτί κουζίνας', 'Μήλα', 'Γάλα']) && headings.length === 3 && headings[0].includes(L('Διάδρομος 1', 'Aisle 1'))
    && JSON.stringify(plain) === JSON.stringify(['Χαρτί κουζίνας', 'Μήλα', 'Γάλα']) === true;
});

await check('price when ticking bought, removed on untick', async () => {
  await tap('.shopping-row:not(.checked) .shopping-check'); await wait();
  const input = '.shopping-row.checked .price-input';
  await page.$eval(input, (el) => el.scrollIntoView({ block: 'center' }));
  await page.type(input, '2.35'); await page.keyboard.press('Tab'); await wait();
  const s = await stored();
  const purchase = s.purchases?.[0];
  return s.purchases?.length === 1 && purchase.price === 2.35 && purchase.category === 'Καθαριότητα' && purchase.storeId === s.stores[0].id;
});
await check('second priced purchase + untick removes its price', async () => {
  await tap('.shopping-row:not(.checked) .shopping-check'); await wait();
  await page.type('.shopping-row.checked:not(:has(.price-input[value="2.35"])) .price-input', '1.5'); await page.keyboard.press('Tab'); await wait();
  await tap('.shopping-row:not(.checked) .shopping-check'); await wait();
  await page.type('.shopping-row.checked:has(.price-input[value=""]) .price-input', '4'); await page.keyboard.press('Tab'); await wait();
  const three = (await stored()).purchases.length;
  const gala = (await stored()).shopping.find((r) => r.name === 'Γάλα');
  await tap(`.shopping-check[data-id="${gala.id}"]`); await wait();
  const s = await stored();
  return three === 3 && s.purchases.length === 2 && !s.purchases.some((p) => p.rowId === gala.id);
});

await check('waste: throw away from pantry with reason', async () => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1'));
    st.items.push({ id: 'w-1', name: 'Γιαούρτι', quantity: 3, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: '2020-01-01' });
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('pantry');
  await tap('[data-action="waste-item"][data-id="w-1"]'); await wait();
  const open = await page.$eval('#waste-dialog', (d) => d.open);
  const reason = await page.$eval('#waste-reason', (e) => e.value);
  const reasonText = await page.$eval('#waste-reason option[value="spoiled"]', (e) => e.textContent);
  const dialogGreek = await greekLeft();
  await page.click('#waste-quantity', { clickCount: 3 }); await page.type('#waste-quantity', '2');
  await page.select('#waste-reason', 'spoiled');
  await shot('waste');
  await page.click('#waste-form button[type=submit]'); await wait();
  const s = await stored();
  return open && reason === 'expired' && reasonText === L('Χάλασε', 'Went bad') && !dialogGreek.length && s.waste?.length === 1 && s.waste[0].reason === 'spoiled'
    && s.items.find((i) => i.id === 'w-1')?.quantity === 1 && !(await page.$eval('#waste-dialog', (d) => d.open));
});

await check('insights: monthly spending per category and waste stats', async () => {
  await nav('insights');
  const total = await page.$eval('#spending-total', (e) => e.textContent);
  const bars = await page.$$eval('#spending-card .bar-row', (els) => els.map((e) => e.textContent));
  const waste = await page.$eval('#waste-total', (e) => e.textContent);
  const month = await page.$eval('#insights-month', (e) => e.textContent);
  await shot('insights');
  await tap('[data-action="insights-month"][data-delta="-1"]'); await wait();
  const prevTotal = await page.$eval('#spending-total', (e) => e.textContent);
  await tap('[data-action="insights-month"][data-delta="1"]'); await wait();
  return /3[.,]85/.test(total) && bars.length === 2 && bars[0].includes(L('Καθαριότητα', 'Cleaning')) && waste === '1' && month.length > 3 && /0[.,]00/.test(prevTotal);
});

await check('what do I cook: soon-to-expire first, add missing to list, TheMealDB ideas', async () => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1'));
    const d = new Date(); d.setDate(d.getDate() + 1);
    const soon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    st.items = [
      { id: 'c1', name: 'Αυγά', quantity: 6, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: soon },
      { id: 'c2', name: 'Ντομάτες', quantity: 4, unit: 'τεμ.', minimum: 0, category: 'Φρούτα & λαχανικά', location: '', expiry: '' }];
    st.shopping = [];
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('cook'); await wait(1200);
  const first = await page.$eval('#recipe-list .recipe-card', (e) => ({ id: e.dataset.recipe, text: e.textContent }));
  const online = await page.$$eval('#recipe-online .recipe-card', (els) => els.map((e) => e.textContent));
  await shot('cook');
  await tap('#recipe-list .recipe-card [data-action="add-missing"]'); await wait();
  const s = await stored();
  const names = s.shopping.map((r) => r.name);
  await tap('#recipe-online .recipe-card [data-action="add-missing"]'); await wait();
  const names2 = (await stored()).shopping.map((r) => r.name);
  if (first.id !== 'strapatsada' || !online.length) console.log('  cook:', first, online, names, names2);
  return first.id === 'strapatsada' && first.text.includes(L('Στραπατσάδα', 'Strapatsada')) && first.text.includes('◷')
    && names.includes(L('Φέτα', 'Feta')) && online.length === 1 && online[0].includes('Shakshuka') && names2.includes('Cumin');
});
await check('what do I cook works offline with built-in recipes', async () => {
  await page.setOfflineMode(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await nav('overview'); await nav('cook'); await wait();
  const cards = (await page.$$('#recipe-list .recipe-card')).length;
  await page.setOfflineMode(false);
  return cards >= 1;
});

await check('scan receipt: paste link, review, edit, import to pantry + spending', async () => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1'));
    st.items = [{ id: 'egg', name: 'Αυγα τσαουση βιολογικα μ-μεσαια 4τ', quantity: 2, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: '' }];
    st.purchases = []; st.receipts = [];
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('overview');
  await tap('.quick-action[data-action="open-receipt"]'); await wait();
  await page.type('#receipt-link-form input[name=link]', `${RECEIPT}/`);
  await page.click('#receipt-link-form button[type=submit]'); await wait(1200);
  const lines = (await page.$$('#receipt-lines .receipt-line')).length;
  const store = await page.$eval('#receipt-store', (e) => e.textContent);
  const total = await page.$eval('#receipt-total', (e) => e.textContent);
  const firstUnit = await page.$eval('[data-line="0"] [name=unit]', (e) => e.value);
  const left = await greekLeft();
  await shot('receipt-review');
  await page.click('[data-line="0"] [name=name]', { clickCount: 3 }); await page.type('[data-line="0"] [name=name]', 'Πεκορίνο');
  await page.click('[data-line="7"] [name=use]');
  await page.click('#receipt-review-form button[type=submit]'); await wait();
  const s = await stored();
  const egg = s.items.find((i) => i.id === 'egg');
  if (lines !== 8 || left.length) console.log('  receipt:', { lines, store, total, left });
  return lines === 8 && store === 'ΔΟΚΙΜΑΣΤΙΚΟ ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΕ' && /19[.,]87/.test(total) && firstUnit === 'κιλά' && !left.length
    && s.items.some((i) => i.name === 'Πεκορίνο' && i.unit === 'κιλά' && i.quantity === 0.276 && i.category === 'Γαλακτοκομικά')
    && egg.quantity === 3 && s.items.length === 7 && s.purchases.length === 7 && s.purchases.every((p) => p.date === '2026-10-10' && p.storeName)
    && s.receipts.length === 1 && !(await page.$eval('#receipt-dialog', (d) => d.open));
});
await check('scan receipt: same receipt via QR camera is refused as duplicate', async () => {
  await nav('pantry');
  await tap('[data-action="open-receipt"]'); await wait();
  await page.click('[data-action="receipt-scan"]'); await wait(2500);
  const dup = await page.$('#receipt-duplicate');
  const disabled = await page.$eval('#receipt-review-form button[type=submit]', (b) => b.disabled);
  await shot('receipt-duplicate');
  await page.click('[data-action="close-receipt"]'); await wait();
  return dup !== null && disabled && (await stored()).receipts.length === 1;
});
await check('scan receipt: AADE summary link records only the total', async () => {
  await tap('[data-action="open-receipt"]'); await wait();
  await page.type('#receipt-link-form input[name=link]', 'https://mydatapi.aade.gr/TimologioQR/QRInfo?issuerVat=999999999&issueDate=12/10/2026&mark=4001&totalGrossValue=12.30');
  await page.click('#receipt-link-form button[type=submit]'); await wait(600);
  const note = await page.$('#receipt-aade-note');
  const offersPhoto = await page.$('#receipt-aade-note ~ .receipt-photo-actions #receipt-photo-camera');
  await page.click('#receipt-review-form button[type=submit]'); await wait();
  const s = await stored();
  const p = s.purchases.find((x) => x.price === 12.3);
  return note !== null && offersPhoto !== null && p?.date === '2026-10-12' && s.receipts.length === 2;
});
await check('receipt photo: mocked OCR -> review with flagged line, import, duplicate refused', async () => {
  const ocrText = fixture('receipt-photo-ocr.txt');
  await page.evaluate((text) => { window.__spitoOcrMock = async () => ({ text, confidence: 91 }); }, ocrText);
  const icon = new URL('../../icons/icon-192.png', import.meta.url).pathname;
  await tap('[data-action="open-receipt"]'); await wait();
  const startLeft = await greekLeft();
  await (await page.$('#receipt-photo-file')).uploadFile(icon);
  await page.waitForSelector('#receipt-lines', { timeout: 15000 });
  const lines = (await page.$$('#receipt-lines .receipt-line')).length;
  const flagged = (await page.$$('#receipt-lines .receipt-line.is-doubtful')).length;
  const store = await page.$eval('#receipt-store', (e) => e.textContent);
  const note = await page.$eval('#receipt-photo-note', (e) => e.textContent);
  const left = [...startLeft, ...(await greekLeft())];
  await shot('receipt-photo-review');
  await page.click('[data-line="2"] [name=price]', { clickCount: 3 }); await page.type('[data-line="2"] [name=price]', '5.79');
  await page.click('#receipt-review-form button[type=submit]'); await wait();
  const s = await stored();
  const mine = s.purchases.filter((p) => p.storeName === 'ΧΑΣΙΩΤΗ');
  await tap('[data-action="open-receipt"]'); await wait();
  await (await page.$('#receipt-photo-camera')).uploadFile(icon);
  await page.waitForSelector('#receipt-lines', { timeout: 15000 });
  const dup = await page.$('#receipt-duplicate');
  await page.click('[data-action="close-receipt"]'); await wait();
  await page.evaluate(() => { delete window.__spitoOcrMock; });
  if (left.length || lines !== 3 || flagged !== 1) console.log('  photo:', { lines, flagged, store, note, left });
  return lines === 3 && flagged === 1 && store === 'ΧΑΣΙΩΤΗ' && note.length > 10 && !left.length && dup !== null
    && mine.length === 3 && mine.every((p) => p.date === '2026-10-17') && Math.abs(mine.reduce((t, p) => t + p.price, 0) - 16) < 0.001
    && s.items.some((i) => i.name === 'Καρυδοψιχα ελληνικη' && i.unit === 'κιλά' && i.category === 'Ξηρά τρόφιμα');
});
await check('scan receipt: http link rejected, proxy setting validated', async () => {
  await tap('[data-action="open-receipt"]'); await wait();
  await page.type('#receipt-link-form input[name=link]', 'http://test-shop.epsilonnet.gr/fd/x');
  await page.click('#receipt-link-form button[type=submit]'); await wait(400);
  const err = await page.$eval('#receipt-error', (e) => e.textContent);
  await page.click('[data-action="close-receipt"]'); await wait();
  await nav('settings');
  await page.type('#proxy-form input[name=proxy]', 'https://proxy.example.workers.dev/');
  await tap('#proxy-form button[type=submit]'); await wait();
  const saved = await page.evaluate(() => localStorage.getItem('spitothiki:receiptProxy'));
  return /https/.test(err) && saved === 'https://proxy.example.workers.dev';
});

await check('meal plan: pick built-in, free text and TheMealDB, week list, copy week', async () => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1'));
    st.items = [{ id: 'eggs1', name: 'Αυγά', quantity: 6, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: '' }];
    st.shopping = []; st.meals = [];
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await nav('cook');
  await tap('#tab-plan'); await wait();
  const cells = (await page.$$('#plan-grid .plan-cell')).length;
  const days = await page.$$eval('#plan-grid .plan-day', (els) => els.map((e) => e.dataset.day));
  await tap(`[data-action="plan-meal"][data-date="${days[0]}"][data-slot="breakfast"]`); await wait();
  await shot('mealplan-dialog');
  await tap('#meal-builtin [data-recipe="omelette"]'); await wait();
  await tap(`[data-action="plan-meal"][data-date="${days[0]}"][data-slot="lunch"]`); await wait();
  await page.type('#meal-text-form input[name=text]', 'Φακές με ρύζι');
  await tap('#meal-text-form button[type=submit]'); await wait();
  await tap(`[data-action="plan-meal"][data-date="${days[1]}"][data-slot="dinner"]`); await wait();
  await page.type('#meal-search-form input[name=q]', 'shakshuka');
  await tap('#meal-search-form button[type=submit]'); await wait(800);
  await tap('#meal-results [data-recipe="mealdb-777"]'); await wait();
  const left = await greekLeft();
  await shot('mealplan-week');
  const s1 = await stored();
  await tap('[data-action="plan-shopping"]'); await wait();
  const names = (await stored()).shopping.map((r) => r.name.toLowerCase());
  await tap('[data-action="plan-week"][data-delta="7"]'); await wait();
  await tap('[data-action="plan-copy"]'); await wait();
  const s2 = await stored();
  await tap('[data-action="plan-week"][data-delta="0"]'); await wait();
  const ok = cells === 21 && s1.meals.length === 3 && !left.length
    && names.some((n) => /τυρί|cheese/.test(n)) && names.some((n) => /φακ|lentil/.test(n)) && names.some((n) => /ρύζι|rice/.test(n)) && names.includes('cumin') && !names.some((n) => /αυγ|egg/.test(n))
    && s2.meals.length === 6 && s2.meals.some((m) => m.recipeId === 'mealdb-777' && m.date > days[6]);
  if (!ok) console.log('  plan:', { cells, meals: s1.meals.length, names, after: s2.meals.length, left });
  return ok;
});

for (const view of ['shopping', 'settings', 'insights', 'pantry', 'cook']) await check(`no Greek UI left on ${view} (${lang})`, async () => { await nav(view); const left = await greekLeft(); if (left.length) console.log('  left:', left); return !left.length; });

console.log(`features ${width} ${lang}: ${errors.length ? 'FAILED ' + JSON.stringify(errors) : 'passed'}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
