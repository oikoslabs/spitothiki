// v1.3: auto shopping list, price comparison from receipts, Greek/raw recipes, recipe → weekly plan.
// Usage: node tests/smoke/v13-smoke.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', dir = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }));
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const W = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { if (dir) await page.screenshot({ path: `${dir}/${n}.png` }); };
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const now = new Date().toISOString(); const today = now.slice(0, 10);
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  localStorage.setItem('spitothiki:onboarded', '1');
  localStorage.setItem('spitothiki:auto-list-base', '1');
  localStorage.setItem('spitothiki:v1', JSON.stringify({
    items: [
      { id: 'i1', name: 'Γάλα φρέσκο', quantity: 1, unit: 'λίτρα', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: d(5), updatedAt: now },
      { id: 'i2', name: 'Γιαούρτι', quantity: 1, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: d(-1), updatedAt: now },
      { id: 'i3', name: 'Μπανάνες', quantity: 4, unit: 'τεμ.', minimum: 0, category: 'Φρούτα & λαχανικά', location: '', expiry: d(1), updatedAt: now },
      { id: 'i4', name: 'Φράουλες', quantity: 1, unit: 'τεμ.', minimum: 0, category: 'Φρούτα & λαχανικά', location: '', expiry: '', updatedAt: now }],
    shopping: [{ id: 's1', name: 'Φέτα ΠΟΠ', quantity: 1, unit: 'τεμ.', checked: false, createdAt: now }],
    receipts: [
      { id: 'r1', date: d(-10), total: 6, store: 'Σκλαβενίτης', format: 'mydata', lines: 2, importedAt: now, items: [{ name: 'ΓΑΛΑ ΦΡΕΣΚΟ 1L', quantity: 1, price: 1.79 }, { name: 'ΦΕΤΑ ΠΟΠ', quantity: 1, price: 4.2 }] },
      { id: 'r2', date: d(-5), total: 5.8, store: 'Lidl', format: 'mydata', lines: 2, importedAt: now, items: [{ name: 'Γάλα φρέσκο 1L', quantity: 1, price: 1.85 }, { name: 'Φέτα ΠΟΠ', quantity: 1, price: 3.99 }] }]
  }));
});
await page.reload({ waitUntil: 'networkidle0' }); await W(800);
// 1) expired yoghurt → list (auto)
let s = await stored();
const auto = s.shopping.filter((r) => r.auto).map((r) => r.name);
if (!auto.includes('Γιαούρτι')) fail(`auto expired ${auto}`);
// milk runs out via − button
await page.goto(url.replace(/#.*$/, '') + '#pantry', { waitUntil: 'networkidle0' }); await W(500);
await page.evaluate(() => document.querySelector('[data-action="adjust-quantity"][data-delta="-1"][data-id="i1"]')?.click()); await W(500);
s = await stored();
if (!s.shopping.some((r) => r.auto && r.name === 'Γάλα φρέσκο')) fail('auto out of stock');
await page.goto(url.replace(/#.*$/, '') + '#shopping', { waitUntil: 'networkidle0' }); await W(500);
if (!(await page.$('.auto-tag'))) fail('auto tag');
await shot('v13-auto-list');
// 2) compare
await page.tap('[data-action="compare-list"]'); await page.waitForSelector('#compare-dialog[open]'); await W(300);
const best = await page.$eval('#compare-best', (e) => e.textContent).catch(() => '');
if (!/Lidl/.test(best)) fail(`best ${best}`);
await shot('v13-compare');
await page.tap('[data-action="close-compare"]'); await W(300);
// 3) recipes: raw filter, bananas+strawberries first
await page.goto(url.replace(/#.*$/, '') + '#cook', { waitUntil: 'networkidle0' }); await W(600);
const greekCount = await page.$$eval('#recipe-list .recipe-card, #all-recipes .recipe-card', (e) => e.length);
await page.tap('[data-action="recipe-filter"][data-cat="raw"]'); await W(500);
const first = await page.$eval('#recipe-list .recipe-card', (e) => e.dataset.recipe).catch(() => '');
if (!['smoothie-banana-strawberry', 'banana-icecream', 'fruit-salad'].includes(first)) fail(`raw first ${first}`);
await shot('v13-recipes-raw');
// 4) recipe → plan
await page.tap('#recipe-list .recipe-card [data-action="recipe-to-plan"]'); await page.waitForSelector('#choice-dialog[open]');
await page.tap('#choice-actions [data-index="0"]'); await W(500);
s = await stored();
if (!s.meals?.some((m) => m.recipeId === first)) fail('recipe to plan');
if (greekCount < 40) fail(`greek count ${greekCount}`);
if (errors.length) fail(errors.join(' | '));
console.log(process.exitCode ? 'FAILED' : 'v13 smoke OK');
await b.close();
