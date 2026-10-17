// Browser smoke test: loads the app in headless Chrome and clicks through the main flows.
// Usage: npm i --no-save puppeteer-core && node tests/smoke/browser-smoke.mjs <url> [width]
// Set CHROME_PATH if Chrome is not at /usr/bin/google-chrome.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 1280);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], headless: true });
const origin = new URL(url).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['notifications', 'camera']);
const page = await browser.newPage();
// Record notifications instead of relying on the headless OS to display them.
await page.evaluateOnNewDocument(() => {
  window.__notifications = [];
  const record = (title, options) => { window.__notifications.push({ title, body: options?.body }); return Promise.resolve(); };
  if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = record;
});
await page.setViewport({ width, height: 900 });
// Pin a Greek browser so the default language is predictable (the app picks English for en* browsers).
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); Object.defineProperty(navigator, 'languages', { get: () => ['el-GR', 'el'] }); });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`http ${r.status()} ${r.url()}`); });

// Answer Open Food Facts lookups with a fixed product so the test doesn't depend on their API.
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().startsWith('https://world.openfoodfacts.org/')) {
    return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 1, product: { product_name_el: 'Γιαούρτι στραγγιστό', brands: 'Fage', categories_tags: ['en:yogurts'] } }) });
  }
  return request.continue();
});
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const count = async (selector) => (await page.$$(selector)).length;
const text = (selector) => page.$eval(selector, (el) => el.textContent);
// Scroll to the middle first so the fixed mobile bottom navigation doesn't cover the target.
async function tap(selector) { await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(400); await page.click(selector); }
async function nav(view) { await page.click(`.nav-item[data-view="${view}"]`); await wait(); }
async function check(name, fn) {
  try { const ok = await fn(); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(`assert: ${name}`); }
  catch (error) { console.log(`FAIL ${name}: ${error.message}`); errors.push(`assert: ${name}: ${error.message}`); }
}

const steps = [
  ['navigate to pantry', async () => { await nav('pantry'); return (await page.evaluate(() => location.hash)) === '#pantry'; }],
  ['add pantry item', async () => {
    await page.click('.page-heading [data-action="add-item"]'); await wait();
    await page.type('#item-name', 'Γάλα');
    await page.select('#item-unit', 'λίτρα');
    await page.click('#item-form button[type=submit]'); await wait();
    return (await count('.inventory-card')) === 1;
  }],
  ['send item to shopping list', async () => {
    await page.click('[data-action="add-to-shopping"]'); await wait();
    await nav('shopping');
    return (await count('.shopping-row')) === 1;
  }],
  ['add free-text shopping item', async () => {
    await page.type('#shopping-form input[name=name]', 'Ψωμί');
    await page.click('#shopping-form button[type=submit]'); await wait();
    return (await count('.shopping-row')) === 2;
  }],
  ['ticking bought adds to pantry', async () => {
    await page.click('.shopping-row:first-child .shopping-check'); await wait();
    await page.click('.shopping-row:not(.checked) .shopping-check'); await wait();
    await nav('pantry');
    const cards = await page.$$eval('.inventory-card', (els) => els.map((el) => el.textContent));
    return cards.length === 2 && cards.some((t) => t.includes('Γάλα') && t.includes('2 λίτρα')) && cards.some((t) => t.includes('Ψωμί'));
  }],
  ['unticking undoes pantry change', async () => {
    await nav('shopping');
    await page.click('.shopping-row.checked .shopping-check'); await wait();
    await nav('pantry');
    return (await page.$$eval('.inventory-card', (els) => els.map((el) => el.textContent))).some((t) => t.includes('Γάλα') && t.includes('1 λίτρα'));
  }],
  ['share list falls back to copy / WhatsApp / Viber dialog', async () => {
    await nav('shopping');
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
    await page.click('[data-action="share-shopping"]'); await wait();
    const open = await page.$eval('#share-dialog', (d) => d.open);
    const value = await page.$eval('#share-text', (el) => el.value);
    const wa = await page.$eval('#share-whatsapp', (el) => el.href);
    await page.click('[data-action="close-share"]'); await wait();
    await nav('pantry');
    return open && value.includes('Γάλα') && wa.startsWith('https://wa.me/?text=');
  }],
  ['manifest and service worker are active', async () => {
    const manifest = await page.$eval('link[rel=manifest]', (el) => el.href);
    const res = await page.evaluate(async (href) => (await fetch(href)).json(), manifest);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle0' });
    const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    return res.short_name === 'Σπιτοθήκη' && controlled;
  }],
  ['app works offline', async () => {
    const before = errors.length;
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' }); await wait(600);
    const ok = (await count('.nav-item')) >= 4 && (await count('.inventory-card')) >= 2;
    await page.setOfflineMode(false);
    errors.splice(before);
    await page.reload({ waitUntil: 'networkidle0' });
    return ok;
  }],
  ['category icons in filters and form', async () => {
    const chips = await page.$$eval('.filter-chip', (els) => els.map((el) => el.textContent));
    const option = await page.$eval('#item-category option[value="Γαλακτοκομικά"]', (el) => el.textContent);
    return chips.some((t) => t.includes('🧺')) && option.includes('🥛');
  }],
  ['dark mode toggle persists', async () => {
    await nav('settings');
    await tap('[data-action="set-theme"][data-theme="dark"]'); await wait();
    const dark = await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.body).backgroundColor !== 'rgb(245, 246, 240)');
    await page.reload({ waitUntil: 'networkidle0' });
    const kept = await page.evaluate(() => document.documentElement.dataset.theme === 'dark');
    await tap('[data-action="set-theme"][data-theme="auto"]'); await wait();
    const auto = await page.evaluate(() => !document.documentElement.dataset.theme);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]); await wait();
    const system = await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(18, 26, 22)');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await nav('pantry');
    return dark && kept && auto && system;
  }],
  ['expiry notifications from settings', async () => {
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('spitothiki:v1'));
      const d = new Date(); d.setDate(d.getDate() + 2);
      state.items[0].expiry = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('spitothiki:v1', JSON.stringify(state));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await nav('settings');
    await tap('[data-action="enable-notifications"]'); await wait(600);
    const first = await page.evaluate(() => window.__notifications);
    const status = await text('#notify-status');
    await page.reload({ waitUntil: 'networkidle0' }); await wait(400);
    const again = await page.evaluate(() => window.__notifications.length);
    await nav('pantry');
    return first.length === 1 && /λήγει|λήγουν/.test(first[0].title) && status.includes('Ενεργές') && again === 0;
  }],
  ['barcode lookup prefills the add form', async () => {
    await tap('.page-heading [data-action="add-item"]'); await wait();
    await page.type('#item-barcode', '5201054017739');
    await page.click('[data-action="lookup-barcode"]'); await wait(800);
    const name = await page.$eval('#item-name', (el) => el.value);
    const category = await page.$eval('#item-category', (el) => el.value);
    await page.click('#item-form button[type=submit]'); await wait();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).items.find((i) => i.barcode === '5201054017739'));
    return name === 'Γιαούρτι στραγγιστό Fage' && category === 'Γαλακτοκομικά' && saved?.name === name;
  }],
  ['camera scanner opens and closes cleanly', async () => {
    await tap('.page-heading [data-action="add-item"]'); await wait();
    await page.click('[data-action="scan-barcode"]'); await wait(2500);
    const open = await page.$eval('#scan-dialog', (d) => d.open);
    const status = await text('#scan-status');
    const playing = await page.$eval('#scan-video', (v) => Boolean(v.srcObject) && v.readyState >= 2);
    await page.click('[data-action="close-scan"]'); await wait();
    const stopped = await page.$eval('#scan-video', (v) => !v.srcObject || v.srcObject.getTracks().every((t) => t.readyState === 'ended'));
    await page.click('#item-form [data-action="close-dialog"]'); await wait();
    if (!(open && playing && stopped)) console.log('  scanner:', { open, status, playing, stopped });
    return open && playing && stopped && status.includes('Στόχευσε');
  }],
  ['sync card: off without config, sign-in when configured', async () => {
    await nav('settings'); await wait(1500);
    const card = await text('#sync-card');
    const signIn = (await page.$('#sync-email-form')) !== null || (await page.$('[data-action="sync-google"]')) !== null;
    await nav('pantry');
    if (!(card.includes('Ανενεργός') || signIn)) console.log('  sync card:', card);
    return card.includes('Ανενεργός') || signIn;
  }],
  ['reload keeps screen and data', async () => {
    await page.reload({ waitUntil: 'networkidle0' }); await wait();
    return (await page.$eval('.nav-item.is-active', (el) => el.dataset.view)) === 'pantry' && (await count('.inventory-card')) === 3;
  }]
];

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'networkidle0' });
for (const [name, fn] of steps) await check(name, fn);
console.log(`width ${width}: ${errors.length ? 'FAILED' : 'passed'}`, errors.length ? JSON.stringify(errors) : '');
await browser.close();
process.exit(errors.length ? 1 : 0);
