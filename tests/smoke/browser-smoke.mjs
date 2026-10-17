// Browser smoke test: loads the app in headless Chrome and clicks through the main flows.
// Usage: npm i --no-save puppeteer-core && node tests/smoke/browser-smoke.mjs <url> [width]
// Set CHROME_PATH if Chrome is not at /usr/bin/google-chrome.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 1280);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setViewport({ width, height: 900 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`http ${r.status()} ${r.url()}`); });

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const count = async (selector) => (await page.$$(selector)).length;
const text = (selector) => page.$eval(selector, (el) => el.textContent);
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
    const ok = (await count('.nav-item')) === 4 && (await count('.inventory-card')) === 2;
    await page.setOfflineMode(false);
    errors.splice(before);
    await page.reload({ waitUntil: 'networkidle0' });
    return ok;
  }],
  ['reload keeps screen and data', async () => {
    await page.reload({ waitUntil: 'networkidle0' }); await wait();
    return (await page.$eval('.nav-item.is-active', (el) => el.dataset.view)) === 'pantry' && (await count('.inventory-card')) === 2;
  }]
];

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'networkidle0' });
for (const [name, fn] of steps) await check(name, fn);
console.log(`width ${width}: ${errors.length ? 'FAILED' : 'passed'}`, errors.length ? JSON.stringify(errors) : '');
await browser.close();
process.exit(errors.length ? 1 : 0);
