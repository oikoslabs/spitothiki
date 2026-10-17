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
// TheMealDB fixtures, so the test does not depend on the live API.
await page.setRequestInterception(true);
page.on('request', (request) => {
  const u = request.url();
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
const greekLeft = async () => en ? (await page.evaluate(() => window.__i18n.untranslatedGreek())).filter((s) => !/Γάλα|Ψωμί|Αυγά|Μήλα|Ρύζι|Γιαούρτι|Ελαιόλαδο|Ντομάτες|Φέτα|Κοτόπουλο|Πατάτες|Χαρτί/.test(s)) : [];

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

for (const view of ['shopping', 'settings', 'insights', 'pantry', 'cook']) await check(`no Greek UI left on ${view} (${lang})`, async () => { await nav(view); const left = await greekLeft(); if (left.length) console.log('  left:', left); return !left.length; });

console.log(`features ${width} ${lang}: ${errors.length ? 'FAILED ' + JSON.stringify(errors) : 'passed'}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
