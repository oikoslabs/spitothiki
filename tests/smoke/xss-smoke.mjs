// v1.9.3 XSS smoke: fills every user/receipt-controlled text field with HTML/script payloads,
// opens every page and the receipts/compare details, and fails if any payload ever runs or becomes a real element.
// Usage: npm i --no-save puppeteer-core && node tests/smoke/xss-smoke.mjs http://127.0.0.1:8099/
import puppeteer from 'puppeteer-core';
import { createPantryItem, createShoppingItem } from '../../src/domain.js';
import { createBill } from '../../src/bills.js';
import { createChore } from '../../src/chores.js';
import { createExtra } from '../../src/extras.js';
import { createTransport } from '../../src/transport.js';

const url = process.argv[2] || 'http://127.0.0.1:8099/';
const P = (tag) => `${tag}<img src=x class=xss-probe onerror="window.__xss=(window.__xss||0)+1">"'><svg/onload=window.__xss=99>`;
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const state = {
  items: [{ ...createPantryItem({ name: 'i' }), name: P('item'), category: P('cat'), location: P('loc') }, createPantryItem({ name: P('item'), category: P('cat'), location: P('loc'), quantity: 1, unit: 'τεμ', expiry: today, barcode: '5201234567890', note: P('note') })],
  shopping: [createShoppingItem({ name: P('shop'), category: P('scat'), quantity: 1, store: P('sstore') })],
  stores: [{ id: 's1', name: P('store') }],
  receipts: [{ id: 'r1', format: 'mydata', issuerName: P('issuer'), store: P('rstore'), date: today, url: 'javascript:window.__xss=7', total: 12.3, importedAt: new Date().toISOString(), items: [{ name: P('line'), price: 1.2 }] }],
  purchases: [{ id: 'p1', receiptId: 'r1', name: P('pname'), price: 1.2, store: P('pstore'), date: today, category: P('pcat') }],
  prices: [{ id: 'pr1', name: P('price'), price: 1.5, store: P('prstore'), date: today }],
  bills: [{ ...createBill({ name: 'b', amount: 40, due: today }), name: P('bill') }],
  chores: [{ ...createChore({ name: 'c', every: 7 }, today), name: P('chore'), assignee: P('assignee') }],
  extras: [{ ...createExtra({ amount: 2, category: 'c1', date: today }), note: P('extra') }],
  extraCategories: [{ id: 'c1', label: P('xcat'), emoji: '☕' }],
  transport: [{ ...createTransport({ type: 'fuel', amount: 30, liters: 20, date: today }), note: P('tnote'), station: P('station') }],
  people: [{ id: 'u1', name: P('member') }, { id: 'u2', name: P('member2') }],
  waste: [{ id: 'w1', name: P('waste'), date: today }],
  meals: [{ id: 'm1', name: P('meal'), date: today }]
};
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });
await page.evaluateOnNewDocument((s) => { if (!localStorage.getItem('spitothiki:v1')) { localStorage.setItem('spitothiki:v1', JSON.stringify(s)); localStorage.setItem('spitothiki:onboarded', '1'); } }, state);
await page.goto(url, { waitUntil: 'networkidle0' });
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const views = await page.$$eval('[data-view]', (els) => [...new Set(els.map((e) => e.dataset.view))]);
let probes = 0; const shownIn = [];
for (const view of views) {
  await page.evaluate((v) => document.querySelector(`[data-view="${v}"]`)?.click(), view); await wait();
  // Open every details/expand button on the page once (receipts, compare, bills…).
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  probes += await page.$$eval('.xss-probe, svg[onload], a[href^="javascript:" i]', (e) => e.length);
  if (await page.evaluate(() => document.body.textContent.includes('<img src=x'))) shownIn.push(view);
}
await page.evaluate(() => document.querySelector('[data-view="receipts"]')?.click()); await wait();
for (const action of ['receipt-open']) await page.evaluate((a) => document.querySelector(`[data-action="${a}"]`)?.click(), action).catch(() => {});
await wait(500);
probes += await page.$$eval('.xss-probe, svg[onload], a[href^="javascript:" i]', (e) => e.length);
const detailOpened = await page.evaluate(() => document.body.textContent.includes('line<img'));
console.log(`receipt details opened: ${detailOpened}, javascript: link rendered: ${await page.$$eval('a[href^="javascript:" i]', (e) => e.length)}`);
const ran = await page.evaluate(() => window.__xss || 0);
const shown = shownIn.length > 0;
await browser.close();
console.log(`views visited: ${views.length}, payload elements in DOM: ${probes}, payload executions: ${ran}, payload shown as plain text on: ${shownIn.join(', ')}`);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
if (probes || ran) { console.error('XSS FOUND'); process.exit(1); }
if (!shown) { console.error('payload text never rendered (test did not exercise the data)'); process.exit(1); }
console.log('XSS smoke passed');
