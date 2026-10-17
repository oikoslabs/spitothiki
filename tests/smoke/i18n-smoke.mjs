// English-mode smoke test: toggles the language, checks nothing Greek is left in the UI chrome,
// that clicks still work, and that stored data stays in Greek.
// Usage: node tests/smoke/i18n-smoke.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const shots = process.argv[3];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=el-GR'], headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
// Pin a Greek browser so the default language is predictable (the app picks English for en* browsers).
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); Object.defineProperty(navigator, 'languages', { get: () => ['el-GR', 'el'] }); });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const DEMO = ['Γάλα', 'Μήλα', 'Ρύζι', 'Γιαούρτι', 'Ελαιόλαδο', 'Φέτα'];
const greek = async () => (await page.evaluate(() => window.__i18n.untranslatedGreek())).filter((s) => !DEMO.some((n) => s.includes(n)));
async function check(name, fn) {
  try { const ok = await fn(); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
}
const nav = async (v) => { await page.click(`.nav-item[data-view="${v}"]`); await wait(); };

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'networkidle0' });

await check('defaults to Greek for el browser', async () => (await page.evaluate(() => document.documentElement.lang)) === 'el' && (await page.$eval('.nav-item[data-view="pantry"]', (e) => e.textContent)).includes('απόθεμά'));
if (shots) await page.screenshot({ path: `${shots}/main-el.png` });
await check('toggle switches to English', async () => {
  await page.click('#lang-toggle'); await wait();
  return (await page.evaluate(() => document.documentElement.lang)) === 'en' && (await page.$eval('.nav-item[data-view="pantry"]', (e) => e.textContent)).includes('My pantry')
    && (await page.$eval('#lang-toggle', (e) => e.textContent)) === 'ΕΛ' && (await page.title()).startsWith('Spitothiki');
});
await check('load samples from settings (English confirm)', async () => {
  await nav('settings');
  await page.$eval('[data-action="load-demo"]', (e) => e.scrollIntoView({ block: 'center' })); await wait();
  await page.click('[data-action="load-demo"]'); await wait();
  return (await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).items.length)) === 5;
});
for (const view of ['overview', 'pantry', 'shopping', 'settings']) {
  await check(`no Greek UI text on ${view}`, async () => { await nav(view); const left = await greek(); if (left.length) console.log('  left:', left); return !left.length; });
}
await check('add item in English keeps Greek stored values', async () => {
  await nav('pantry');
  await page.click('.page-heading [data-action="add-item"]'); await wait();
  const dialogGreek = await greek();
  const title = await page.$eval('#dialog-title', (e) => e.textContent);
  await page.type('#item-name', 'Cheese');
  await page.select('#item-unit', 'κιλά');
  await page.select('#item-category', 'Γαλακτοκομικά');
  await page.select('#item-location', 'Ψυγείο');
  const optionText = await page.$eval('#item-unit option[value="κιλά"]', (e) => e.textContent);
  await page.click('#item-form button[type=submit]'); await wait();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).items.find((i) => i.name === 'Cheese'));
  const card = await page.$$eval('.inventory-card', (els) => els.map((e) => e.textContent).find((t) => t.includes('Cheese')));
  if (dialogGreek.length) console.log('  dialog left:', dialogGreek);
  return title === 'New product' && optionText === 'kg' && !dialogGreek.length && saved?.unit === 'κιλά' && saved.category === 'Γαλακτοκομικά' && saved.location === 'Ψυγείο'
    && card.includes('Dairy') && card.includes('Fridge') && card.includes('1 kg');
});
await check('Greek-accent search still works in English mode', async () => {
  await page.type('#pantry-search', 'ελαιολαδο'); await wait();
  const n = (await page.$$('.inventory-card')).length;
  await page.click('#pantry-search', { clickCount: 3 }); await page.keyboard.press('Backspace'); await wait();
  await page.type('#pantry-search', 'fridge'); await wait();
  const m = (await page.$$('.inventory-card')).length;
  await page.click('#pantry-search', { clickCount: 3 }); await page.keyboard.press('Backspace'); await wait();
  return n === 1 && m >= 2;
});
await check('category filter + buttons work in English', async () => {
  await page.click('[data-action="filter-category"][data-category="Γαλακτοκομικά"]'); await wait();
  const n = (await page.$$('.inventory-card')).length;
  await page.click('[data-action="filter-category"][data-category="Όλα"]'); await wait();
  await page.click('[data-action="add-to-shopping"]'); await wait();
  const toast = await page.$eval('#toast', (e) => e.textContent);
  await nav('shopping');
  const rows = (await page.$$('.shopping-row')).length;
  await page.click('.shopping-row .shopping-check'); await wait();
  const toast2 = await page.$eval('#toast', (e) => e.textContent);
  return n === 3 && /added to the list/.test(toast) && rows === 1 && !/[\u0370-\u03ff]{4,}/.test(toast2.replace(/«|»|“.*”/g, ''));
});
await check('delete confirm dialog is English and works', async () => {
  await nav('pantry');
  const before = (await page.$$('.inventory-card')).length;
  await page.click('[data-action="delete-item"]'); await wait();
  const title = await page.$eval('#confirm-title', (e) => e.textContent);
  const ok = await page.$eval('#confirm-accept', (e) => e.textContent);
  await page.click('#confirm-accept'); await wait();
  return title === 'Remove product?' && ok === 'Yes, continue' && (await page.$$('.inventory-card')).length === before - 1;
});
await check('English dates use English locale', async () => {
  await nav('overview');
  const pills = await page.$$eval('.expiry-pill', (els) => els.map((e) => e.textContent));
  return pills.length > 0 && pills.every((p) => /Expire/.test(p));
});
await check('choice persists across reload', async () => {
  await page.reload({ waitUntil: 'networkidle0' }); await wait();
  return (await page.evaluate(() => document.documentElement.lang)) === 'en' && (await page.$eval('.nav-item[data-view="shopping"]', (e) => e.textContent)).includes('Shopping list');
});
if (shots) { await nav('overview'); await page.screenshot({ path: `${shots}/main-en.png` }); }
await check('switch back to Greek', async () => {
  await page.click('#lang-toggle'); await wait();
  return (await page.evaluate(() => document.documentElement.lang)) === 'el' && (await page.$eval('.nav-item[data-view="shopping"]', (e) => e.textContent)).includes('Λίστα αγορών')
    && (await page.$eval('#item-unit option[value="κιλά"]', (e) => e.textContent)) === 'κιλά';
});
console.log(errors.length ? `FAILED ${JSON.stringify(errors)}` : 'i18n smoke passed');
await browser.close();
process.exit(errors.length ? 1 : 0);
