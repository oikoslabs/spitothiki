// v1.5.6: recovery box finds any recent receipt (with items too); last entries visible whatever the month;
// a duplicate scan can be saved anyway; plain manual toll entry works. Demo data only.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const icon = fileURLToPath(new URL('../../icons/icon-192.png', import.meta.url));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
const shot = async (n) => { if (shots) await pg.screenshot({ path: `${shots}/v156-${n}.png` }); };
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' });
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }; });
await pg.goto(url, { waitUntil: 'networkidle0' });
const now = new Date().toISOString(), d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
await pg.evaluate((now, d3) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1');
  localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [],
    receipts: [{ id: 'photo-x', date: d3, total: 2.55, store: 'ΝΕΑ Ο∆ΟΣ Α.Ε.', lines: 2, items: [{ name: 'ΚΑΤ 1', price: 2.55 }, { name: 'ΦΠΑ', price: 0 }], importedAt: now }],
    purchases: [{ id: 'p1', name: 'ΚΑΤ 1', category: 'Άλλο', price: 2.55, date: d3, receiptId: 'photo-x', updatedAt: now }],
    transport: [{ id: 'tr-old', type: 'tolls', amount: 1.9, date: '2025-03-02', note: 'Μορέας', createdAt: now, updatedAt: now }] })); }, now, d(3));
await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
await pg.evaluate(() => { location.hash = '#transport'; }); await wait(900);
check('recovery box lists a recent receipt that has items', Boolean(await pg.$('#transport-misfiled [data-id="photo-x"]'))); await shot('1-box');
check('«Τελευταίες καταχωρίσεις» shows an entry from another month', Boolean(await pg.$('#transport-recent [data-transport="tr-old"]')));
if (shots) { await pg.evaluate(() => document.querySelector('#transport-recent').scrollIntoView({ block: 'center' })); await wait(200); await shot('2-recent'); }
// Plain manual toll entry
await pg.evaluate(() => { window.scrollTo(0, 0); const f = document.querySelector('#transport-form'); f.elements.type.value = 'tolls'; f.elements.type.dispatchEvent(new Event('change', { bubbles: true })); });
await pg.type('#transport-amount', '2.55'); await pg.type('#transport-note', 'Αττική Οδός'); await shot('3-manual-form');
await pg.evaluate(() => document.querySelector('#transport-save').scrollIntoView({ block: 'center' })); await wait(300); await pg.click('#transport-save'); await wait(900);
await pg.reload({ waitUntil: 'networkidle0' }); await wait(900); await pg.evaluate(() => { location.hash = '#transport'; }); await wait(900);
const n = await pg.evaluate(() => (JSON.parse(localStorage.getItem('spitothiki:v1')).transport || []).filter((e) => e.note === 'Αττική Οδός').length);
const shown = await pg.evaluate(() => [...document.querySelectorAll('#transport-recent .bill-meta')].some((e) => e.textContent.includes('Αττική Οδός')));
check('manual toll saved and visible after reopening', n === 1 && shown, { n, shown });
if (shots) { await pg.evaluate(() => document.querySelector('#transport-recent').scrollIntoView({ block: 'center' })); await wait(200); await shot('4-manual-saved'); }
// Duplicate scan → «Αποθήκευση ξανά»
const ocr = 'ΚΑΤΑΣΤΗΜΑ ΔΟΚΙΜΗ\nΓΑΛΑ 1,20\nΣΥΝΟΛΟ 1,20\n';
for (let i = 0; i < 2; i++) {
  await pg.evaluate((text) => { window.__spitoOcrMock = async () => ({ text, confidence: 90 }); location.hash = '#receipts'; }, ocr); await wait(700); await pg.evaluate(() => [...document.querySelectorAll('#app button, main button')].find((b) => b.textContent.includes('Σάρωση απόδειξης')).click()); await wait(500);
  await (await pg.$('#receipt-photo-file')).uploadFile(icon); await wait(2500);
  if (i === 0) { await pg.evaluate(() => document.querySelector('#receipt-review-form button[type="submit"]').click()); await wait(900); await pg.evaluate(() => document.querySelector('#receipt-dialog')?.open && document.querySelector('#receipt-dialog').close()); }
}
const dup = await pg.evaluate(() => ({ btn: Boolean(document.querySelector('#receipt-save-anyway')), dis: document.querySelector('#receipt-review-form button[type="submit"]')?.disabled }));
check('duplicate says so and offers «Αποθήκευση ξανά»', dup.btn && dup.dis, dup); await shot('5-duplicate');
await pg.click('#receipt-save-anyway'); await wait(400);
check('after «Αποθήκευση ξανά» the save button works', await pg.evaluate(() => !document.querySelector('#receipt-review-form button[type="submit"]').disabled));
await browser.close(); process.exit(failed ? 1 : 0);
