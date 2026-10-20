// «🧾 Αποδείξεις»: menu entry, list newest first, month filter, details, delete + undo. Usage: node tests/smoke/receipts-smoke.mjs <url> [screenshot]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shot = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }));
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  const receipts = [
    { id: 'r1', date: d(1), total: 34.72, store: 'Σούπερ Μάρκετ Γειτονιάς', format: 'mydata', lines: 3, importedAt: new Date().toISOString(), url: 'https://example.epsilonnet.gr/fd/demo', items: [{ name: 'Γάλα φρέσκο', quantity: 2, unit: 'τεμ.', price: 3.2 }, { name: 'Ντομάτες', quantity: 1.2, unit: 'κιλά', price: 2.9 }, { name: 'Φέτα', quantity: 1, unit: 'τεμ.', price: 6.5 }] },
    { id: 'r2', date: d(3), total: 45, store: 'Πρατήριο καυσίμων', format: 'transport', lines: 0, importedAt: new Date().toISOString() },
    { id: 'r3', date: d(6), total: 4.6, store: 'Φούρνος', format: 'mydata', lines: 2, importedAt: new Date().toISOString(), items: [{ name: 'Ψωμί χωριάτικο', quantity: 1, price: 2.1 }, { name: 'Κουλούρια', quantity: 5, price: 2.5 }] },
    { id: 'r4', date: d(40), total: 61.3, store: 'Σούπερ Μάρκετ Γειτονιάς', format: 'mydata', lines: 1, importedAt: new Date().toISOString(), items: [{ name: 'Απορρυπαντικό', quantity: 1, price: 61.3 }] }
  ];
  const purchases = [{ id: 'pur-r1-0', receiptId: 'r1', name: 'Γάλα φρέσκο', category: 'Γαλακτοκομικά', price: 6.4, date: d(1) }];
  localStorage.setItem('spitothiki:onboarded', '1');
  localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], receipts, purchases }));
});
await page.reload({ waitUntil: 'networkidle0' });
await page.tap('.topbar .menu-button'); await page.waitForSelector('#menu-sheet[open] [data-view="receipts"]');
await page.tap('#menu-sheet [data-view="receipts"]'); await page.waitForSelector('#receipts-list'); await W(300);
const names = await page.$$eval('#receipts-list .receipt-main strong', (e) => e.map((x) => x.textContent));
if (names[0] !== 'Σούπερ Μάρκετ Γειτονιάς' || names.length !== 4) fail(`order ${names}`);
const cat = await page.$eval('#receipts-list li:first-child small', (e) => e.textContent);
if (!/Γαλακτοκομικά/.test(cat)) fail(`category ${cat}`);
if (shot) await page.screenshot({ path: shot });
const chips = await page.$$('.receipts-months .filter-chip');
if (chips.length >= 3) { await chips[2].tap(); await W(300); const n = await page.$$eval('#receipts-list li', (e) => e.length); if (n !== 1) fail(`month filter ${n}`); await (await page.$('.receipts-months .filter-chip')).tap(); await W(300); }
await page.tap('#receipts-list li:first-child .receipt-row'); await page.waitForSelector('#receipt-detail-dialog[open] #receipt-items');
const items = await page.$$eval('#receipt-items li', (e) => e.length); const link = await page.$('#receipt-link');
if (items !== 3 || !link) fail(`details ${items} ${!!link}`);
await page.tap('#receipt-detail-dialog [data-action="receipt-delete"]'); await W(400);
let n = await page.$$eval('#receipts-list li', (e) => e.length); if (n !== 3) fail(`after delete ${n}`);
await page.evaluate(() => document.querySelector('.toast [data-action], .toast button, #toast button')?.click()); await W(500);
n = await page.$$eval('#receipts-list li', (e) => e.length); if (n !== 4) fail(`after undo ${n}`);
const p = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).purchases.length); if (p !== 1) fail(`purchases after undo ${p}`);
// Expenses entry point
await page.evaluate(() => { location.hash = '#insights'; }); await page.waitForSelector('#insights-receipts');
await page.tap('#insights-receipts'); await page.waitForSelector('#receipts-list');
// English
await page.evaluate(() => document.querySelector('#lang-toggle').click()); await W(500);
const h = await page.$eval('.view-content h1, .view-content h2', (e) => e.textContent); if (!/Receipts/.test(h)) fail(`en ${h}`);
if (errors.length) fail(errors.join('; '));
console.log(process.exitCode ? 'receipts smoke: FAIL' : 'receipts smoke: all ok');
await b.close();
