// v1.4: encrypted backup, persistent storage line, backup reminder, offline bar + save-for-later, edit saved receipt.
// Usage: node tests/smoke/v14-smoke.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url = 'http://127.0.0.1:8080/', dir = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }));
const dl = mkdtempSync(join(tmpdir(), 'spbak-'));
const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const W = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { if (dir) await page.screenshot({ path: `${dir}/${n}.png` }); };
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')));
const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const now = new Date().toISOString(); const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:auto-list-base', '1');
  localStorage.setItem('spitothiki:signin-card-dismissed', String(Date.now()));
  localStorage.setItem('spitothiki:v1', JSON.stringify({
    items: [{ id: 'i1', name: 'Γάλα φρέσκο', quantity: 2, unit: 'λίτρα', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: d(5), updatedAt: now }],
    shopping: [],
    receipts: [{ id: 'r1', date: d(-2), total: 5.99, store: 'Σούπερ Μάρκετ Δοκιμή', format: 'mydata', lines: 2, importedAt: now, items: [{ name: 'Γάλα φρέσκο 1L', quantity: 1, price: 1.79 }, { name: 'Φέτα ΠΟΠ', quantity: 1, price: 4.2 }] }],
    purchases: [{ id: 'pur-r1-0', receiptId: 'r1', name: 'Γάλα φρέσκο 1L', category: 'Γαλακτοκομικά', price: 1.79, date: d(-2), storeName: 'Σούπερ Μάρκετ Δοκιμή' }, { id: 'pur-r1-1', receiptId: 'r1', name: 'Φέτα ΠΟΠ', category: 'Γαλακτοκομικά', price: 4.2, date: d(-2), storeName: 'Σούπερ Μάρκετ Δοκιμή' }]
  }));
});
await page.reload({ waitUntil: 'networkidle0' }); await W(800);
// 1) reminder on home (not signed in, never backed up)
if (!await page.$('#home-backup-card')) fail('no backup reminder'); await shot('v14-home-reminder');
// 2) settings: export encrypted
await page.goto(url.replace(/#.*$/, '') + '#settings', { waitUntil: 'networkidle0' }); await W(500);
if (!await page.$('#persist-status')) fail('no persist status');
await page.evaluate(() => document.querySelector('#backup-actions').scrollIntoView({ block: 'center' })); await W(600); await page.evaluate(() => document.querySelector('#backup-actions').scrollIntoView({ block: 'center' })); await W(300); await shot('v14-settings-backup');
await click('[data-action="export-backup"]'); await W(300);
await page.type('#backup-pass', 'kodikos123'); await page.type('#backup-pass2', 'kodikos123'); await shot('v14-backup-password');
await click('#backup-pass-ok'); await W(2500);
const files = readdirSync(dl); const bak = files.find((f) => f.endsWith('.spitobak'));
if (!bak) fail(`no .spitobak: ${files}`);
const text = readFileSync(join(dl, bak), 'utf8'); if (text.includes('Γάλα') || !text.includes('spitothiki-encrypted')) fail('not encrypted');
if (!await page.evaluate(() => localStorage.getItem('spitothiki:last-backup'))) fail('last backup not stored');
// 3) import: wrong then right password
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('spitothiki:v1')); s.items = []; localStorage.setItem('spitothiki:v1', JSON.stringify(s)); });
const input = await page.$('#backup-file'); await input.uploadFile(join(dl, bak)); await W(500);
if (!await page.evaluate(() => document.querySelector('#backup-pass-dialog').open)) fail('no import password dialog');
await page.type('#backup-pass', 'lathos'); await click('#backup-pass-ok'); await W(1500);
const toast = await page.evaluate(() => document.querySelector('#toast').textContent);
if (!/Λάθος κωδικός/.test(toast)) fail(`wrong pw toast: ${toast}`); await shot('v14-wrong-password');
if (!await page.evaluate(() => document.querySelector('#backup-pass-dialog').open)) fail('not re-asked');
await page.type('#backup-pass', 'kodikos123'); await click('#backup-pass-ok'); await W(1500);
await click('#confirm-accept'); await W(500);
if ((await stored()).items.length !== 1) fail('import did not restore');
// 4) edit receipt
await page.goto(url.replace(/#.*$/, '') + '#receipts', { waitUntil: 'networkidle0' }); await W(500);
await click('[data-action="receipt-open"][data-id="r1"]'); await W(300); await shot('v14-receipt-details');
await click('#receipt-edit'); await W(300);
await page.evaluate(() => { const p = document.querySelector('.receipt-edit-line[data-line="1"] [name="price"]'); p.value = '3.90'; p.dispatchEvent(new Event('input', { bubbles: true })); });
await W(200); await shot('v14-receipt-edit');
await click('#receipt-edit-save'); await W(500);
const s = await stored();
if (s.receipts[0].total !== 5.69) fail(`edit total ${s.receipts[0].total}`);
if (s.purchases.find((p) => p.id === 'pur-r1-1').price !== 3.9) fail('purchase not updated');
await click('[data-action="receipt-detail-close"]');
// 5) offline bar + save for later
await page.setOfflineMode(true); await W(400);
if (await page.evaluate(() => document.querySelector('#offline-bar').hidden)) fail('offline bar hidden');
await click('[data-action="menu-receipt"]'); await W(400);
await page.evaluate(() => { const f = document.querySelector('#receipt-link-form'); f.elements.link.value = 'https://example.invalid/receipt?id=1'; f.requestSubmit(); }); await W(800);
if (!await page.$('#receipt-save-later')) fail('no save-later'); await shot('v14-offline-save-later');
await click('#receipt-save-later'); await W(300);
const q = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:receipt-queue') || '[]'));
if (q.length !== 1) fail('not queued'); await shot('v14-offline-bar');
await page.setOfflineMode(false); await W(2500);
const opened = await page.evaluate(() => document.querySelector('#receipt-dialog').open);
if (!opened) fail('queue not processed on reconnect');
await shot('v14-back-online');
if (errors.length) fail(errors.join(' | '));
console.log(process.exitCode ? 'v14 smoke FAILED' : 'v14 smoke OK');
await b.close();
