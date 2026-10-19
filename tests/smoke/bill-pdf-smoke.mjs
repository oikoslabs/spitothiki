// Bill PDF import in a real browser (real pdf.js + real QR decoding, no fakes):
// column layout telecom PDF fills amount + due from text; a PDF whose amount is only in an EPC QR gets it from the QR.
// Usage: node tests/smoke/bill-pdf-smoke.mjs <url> [shotsDir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const shots = process.argv[3];
const pdf = (name) => new URL(`../fixtures/bills/${name}`, import.meta.url).pathname;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}#bills`, { waitUntil: 'networkidle0' });
let failed = 0;
async function importPdf(name, expectName) {
  await (await page.$('#bill-file')).uploadFile(pdf(name));
  await page.waitForFunction((v) => document.querySelector('#bill-name')?.value === v && /Έλεγξε|Συμπλήρωσε/.test(document.querySelector('#bill-scan-status').textContent) && !/Αναζήτηση για/.test(document.querySelector('#bill-scan-status').textContent), { timeout: 60000 }, expectName);
  return page.evaluate(() => ({ amount: document.querySelector('#bill-amount').value, due: document.querySelector('#bill-due').value, ref: document.querySelector('#bill-reference').value, status: document.querySelector('#bill-scan-status').textContent }));
}
const v = await importPdf('vodafone-columns.pdf', 'Vodafone');
if (shots) await page.screenshot({ path: `${shots}/bill-pdf-telecom-phone.png` });
const ok1 = v.amount === '32.45' && v.due === '2026-11-05' && v.ref === 'RF18539007547034';
console.log(`${ok1 ? 'ok  ' : 'FAIL'} telecom columns PDF → amount 32,45 + due 05/11 (not the issue date)`, ok1 ? '' : v); failed += !ok1;
await page.click('[data-action="close-bill"]');
// The QR-only PDF has no amount/due in its text, so OCR would run for the missing due date: mock it empty.
await page.evaluate(() => { window.__spitoOcrMock = async () => ({ text: '', confidence: 0 }); });
const n = await importPdf('nova-epc.pdf', 'Nova');
if (shots) await page.screenshot({ path: `${shots}/bill-pdf-qr-phone.png` });
const ok2 = n.amount === '49.6' && n.due === '' && /ποσό \(από QR\)/.test(n.status) && /Συμπλήρωσε: λήξη/.test(n.status);
console.log(`${ok2 ? 'ok  ' : 'FAIL'} EPC QR on the page → amount from QR, due left empty for manual entry`, ok2 ? '' : n); failed += !ok2;
await browser.close();
if (errors.length) { console.log('errors', errors); failed++; }
console.log(failed ? 'bill pdf smoke: FAILED' : 'bill pdf smoke: all ok');
process.exit(failed ? 1 : 0);
