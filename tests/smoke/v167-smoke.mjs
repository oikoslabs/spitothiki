// Usage: node tests/smoke/v167-smoke.mjs <url> <video.y4m with a demo QR>
// v1.6.7: receipt scans skip a till barcode (date+till+transaction) and wait for the receipt QR. Demo values only.
import puppeteer from 'puppeteer-core';
const [url, y4m] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
let fail = false;
const stub = (qrAfter) => { localStorage.setItem('spitothiki:onboarded', '1'); let n = 0;
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf', 'code_39', 'data_matrix', 'pdf417']; }
    constructor({ formats }) { this.f = formats; }
    async detect() { n++; if (this.f.includes('code_128')) { if (n < qrAfter || !this.f.includes('qr_code')) return [{ rawValue: '20250315000007123456' }]; } return n >= qrAfter && this.f.includes('qr_code') ? [{ rawValue: 'https://e-invoicing.gr/edocuments/ViewInvoice/-1/demo-0000_1/EN16931' }] : []; } }; };
for (const [name, open] of [['footer all', (p) => p.tap('.quick-bar-item[data-quick="scan"]')], ['receipt', async (p) => { await p.evaluate(() => document.querySelector('[data-action="menu-receipt"]').click()); await p.waitForSelector('#receipt-dialog[open] [data-action="receipt-scan"]'); await p.click('#receipt-dialog[open] [data-action="receipt-scan"]'); }]]) {
  const p = await b.newPage(); await p.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.evaluateOnNewDocument(stub, 40);
  await p.evaluateOnNewDocument(() => localStorage.setItem('spitothiki:lang', 'el'));
  await p.goto(url, { waitUntil: 'networkidle0' });
  await open(p);
  const hint = await p.waitForFunction(() => /barcode του ταμείου/.test(document.querySelector('#scan-status')?.textContent || ''), { timeout: 10000 }).then(() => true, () => false);
  const stillOpen = await p.evaluate(() => document.querySelector('#scan-dialog').open);
  const ok = await p.waitForFunction(() => !document.querySelector('#scan-dialog')?.open && document.querySelector('#receipt-dialog')?.open, { timeout: 20000 }).then(() => true, () => false);
  await new Promise((r) => setTimeout(r, 1500));
  const r = await p.evaluate(() => ({ err: document.querySelector('#receipt-error')?.textContent || '', link: document.querySelector('#receipt-link-form input')?.value || document.body.innerHTML.includes('demo-0000_1') }));
  const res = { name, hint, stillOpenAfterTill: stillOpen, routedToReceipt: ok, tillError: /ταμείου/.test(r.err), link: r.link, errors };
  console.log(JSON.stringify(res)); if (!hint || !stillOpen || !ok || res.tillError || errors.length) fail = true; await p.close();
}
console.log(fail ? 'FAIL' : 'PASS'); await b.close(); if (fail) process.exitCode = 1;
