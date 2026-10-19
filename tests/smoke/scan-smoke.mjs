// «Σκάναρε οτιδήποτε»: the quick-bar button opens the camera; each kind of code goes to the right place.
// Usage: node tests/smoke/scan-smoke.mjs <url> [width] [lang] [shotsDir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 390); const lang = process.argv[4] || 'el'; const shots = process.argv[5];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], headless: true });
const page = await browser.newPage(); await page.setBypassServiceWorker(true);
await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
await page.evaluateOnNewDocument((l) => {
  Object.defineProperty(navigator, 'language', { get: () => (l === 'en' ? 'en-US' : 'el-GR') });
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf', 'code_39', 'data_matrix', 'pdf417']; } constructor() {} async detect() { return window.__fakeCode ? [{ rawValue: window.__fakeCode }] : []; } };
}, lang);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
page.on('request', (r) => (/cloudflareinsights/.test(r.url()) ? r.abort() : /world\.openfoodfacts/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 1, product: { product_name: 'Γάλα δοκιμής', categories_tags: [] } }) }) : r.continue()));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); }); await page.reload({ waitUntil: 'networkidle0' });
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = async (name, fn) => { let ok = false; try { ok = await fn(); } catch (e) { console.log(e.message); } console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); failed += !ok; };
const scan = async (code) => {
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); location.hash = '#overview'; });
  await wait(300);
  await page.evaluate((c) => { window.__fakeCode = c; }, code);
  const sel = width < 700 ? '.bottom-nav [data-quick="scan"], [data-quick="scan"]' : '[data-quick="scan"]';
  await page.evaluate((s) => document.querySelector(s).click(), sel);
  await wait(1500);
  await page.evaluate(() => { window.__fakeCode = ''; });
};
await check('button is in the quick-actions bar', async () => Boolean(await page.$('[data-quick="scan"]')));
await scan('5201054002107');
if (shots) await page.screenshot({ path: `${shots}/v11-after-scan-product-phone.png` });
await check('product barcode → asks pantry or list → pantry form prefilled', async () => {
  const open = await page.$eval('#choice-dialog', (d) => d.open);
  await page.click('#choice-actions [data-index="0"]'); await wait(1200);
  const v = await page.evaluate(() => ({ dlg: document.querySelector('#item-dialog')?.open, barcode: document.querySelector('#item-form [name=barcode]')?.value, screen: document.body.dataset.screen }));
  return open && v.dlg && v.barcode === '5201054002107';
});
await scan('5201054002107');
await check('product barcode → shopping list (name looked up)', async () => {
  await page.click('#choice-actions [data-index="1"]'); await wait(1200);
  return page.evaluate(() => document.body.dataset.screen === 'shopping' && /Γάλα δοκιμής/.test(document.querySelector('#view-content').textContent));
});
await scan('BCD\n002\n1\nSCT\n\nΕΥΔΑΠ ΑΕ\nGR1601101250000000012300695\nEUR31.40\n\n\nRF18539007547034');
await check('EPC payment QR → new bill with amount and payment code', async () => page.evaluate(() => document.querySelector('#bill-dialog').open && document.querySelector('#bill-amount').value === '31.4' && document.querySelector('#bill-reference').value === 'RF18539007547034'));
await scan('052026101416334700835339100998700009');
await check('toll barcode → Μετακινήσεις with a tolls draft', async () => page.evaluate(() => document.body.dataset.screen === 'transport' && document.querySelector('#transport-type')?.value === 'tolls'));
await scan('https://receipt.example.invalid/r?id=1');
await check('receipt link → receipt dialog', async () => page.evaluate(() => document.querySelector('#receipt-dialog').open));
await scan('hello 42');
await check('unknown → raw value shown with choices', async () => page.evaluate(() => document.querySelector('#choice-dialog').open && document.querySelector('#choice-raw').textContent === 'hello 42' && document.querySelectorAll('#choice-actions button').length === 3));
await check('scan dialog offers «photo or PDF»', async () => { await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); document.querySelector('[data-quick="scan"]').click(); }); await wait(600); return page.$eval('#scan-file-row', (e) => !e.hidden); });
await check('PDF from the scan dialog → bill import', async () => {
  // fresh page without request interception (it interferes with the pdf.js worker)
  const p2 = await browser.newPage(); await p2.setBypassServiceWorker(true);
  await p2.setViewport({ width, height: 844 });
  await p2.goto(url, { waitUntil: 'networkidle0' });
  await p2.evaluate(() => { localStorage.setItem('spitothiki:onboarded', '1'); document.querySelector('[data-quick="scan"]').click(); });
  await wait(600);
  await (await p2.$('#scan-file')).uploadFile(new URL('../fixtures/bills/dei.pdf', import.meta.url).pathname);
  await p2.waitForFunction(() => document.querySelector('#bill-name')?.value === 'ΔΕΗ', { timeout: 30000 });
  return true;
});
await browser.close();
if (errors.length) { console.log(errors); failed++; }
console.log(failed ? `scan smoke ${width} ${lang}: FAILED` : `scan smoke ${width} ${lang}: all ok`);
process.exit(failed ? 1 : 0);
