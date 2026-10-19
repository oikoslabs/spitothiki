// Phone screenshots of the home screen, the menu and every section (for before/after UX comparisons).
// Usage: node tests/smoke/ux-shots.mjs <url> <outDir> <prefix> [el|en]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', out = '/workspace/spitothiki_qa', prefix = 'ux', lang = 'el'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((lang) => { Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') }); }, lang);
await page.setRequestInterception(true);
page.on('request', (r) => (/cloudflareinsights|themealdb|openfoodfacts/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', body: '{"meals":null}' }) : r.continue()));
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'networkidle0' });
// Same sample household for every run: demo pantry/list + a few expenses this month.
await page.evaluate(() => {
  localStorage.clear();
  const d = new Date(); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const day = (n) => `${ym}-${String(n).padStart(2, '0')}`;
  const now = new Date().toISOString();
  const today = `${ym}-${String(d.getDate()).padStart(2, '0')}`;
  const st = { items: [], shopping: [],
    transport: [{ id: 't1', type: 'fuel', amount: 60, liters: 35, date: day(2), note: '', createdAt: now, updatedAt: now }, { id: 't2', type: 'tolls', amount: 2.8, date: day(5), note: 'Αττική Οδός', createdAt: now, updatedAt: now }],
    bills: [], extras: [{ id: 'x1', category: 'coffee', amount: 2.5, qty: 1, date: today, note: '', createdAt: now, updatedAt: now }, { id: 'x2', category: 'tobacco', amount: 4.8, qty: 1, date: day(1), note: '', createdAt: now, updatedAt: now }] };
  localStorage.setItem('spitothiki:v1', JSON.stringify(st));
});
await page.goto(url, { waitUntil: 'networkidle0' });
// Demo pantry + list through the app itself.
await page.evaluate(() => { location.hash = '#settings'; }); await wait();
const demo = await page.$('[data-action="load-demo"]');
if (demo) { await demo.evaluate((e) => e.click()); await wait(); const ok = await page.$('#confirm-dialog[open] [value="confirm"], #confirm-dialog[open] button[type="submit"]'); if (ok) { await ok.click(); await wait(); } }
await wait(2800);
const shot = async (name, full = false) => { await wait(600); await page.screenshot({ path: `${out}/${prefix}-${name}.png`, fullPage: full }); };
const go = async (view) => { await page.evaluate((v) => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); location.hash = `#${v}`; }, view); await wait(); await page.evaluate(() => window.scrollTo(0, 0)); };
await go('overview'); await shot('home'); await shot('home-full', true);
await page.evaluate(() => document.querySelector('[data-action="open-menu"]:not([hidden])')?.click() || document.querySelector('[data-action="open-menu"]').click()); await wait();
await shot('menu');
const more = await page.$('.quick-bar [data-quick="all"]');
if (more) { await page.evaluate(() => document.querySelector('#menu-sheet').close()); await wait(); await more.click(); await wait(); await shot('quick-actions'); }
for (const view of ['pantry', 'shopping', 'cart', 'cook', 'bills', 'transport', 'extras', 'insights', 'settings']) { await go(view); await shot(view); await shot(`${view}-full`, true); }
await browser.close();
console.log('saved', prefix);
