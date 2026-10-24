// v1.6.6 smoke. Usage: node tests/smoke/v166-smoke.mjs <url> <video.y4m with a demo receipt QR>
// Android phone whose BarcodeDetector reports formats but never finds anything: ZXing must take over.
import puppeteer from 'puppeteer-core';
const [url, y4m] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
let fail = false;
for (const [name, open] of [['footer all', (p) => p.tap('.quick-bar-item[data-quick="scan"]')], ['receipt', async (p) => { await p.evaluate(() => document.querySelector('[data-action="menu-receipt"]').click()); await p.waitForSelector('#receipt-dialog[open] [data-action="receipt-scan"]'); await p.click('#receipt-dialog[open] [data-action="receipt-scan"]'); }]]) {
  const p = await b.newPage(); await p.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.evaluateOnNewDocument(() => { localStorage.setItem('spitothiki:onboarded', '1'); window.__calls = 0;
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf', 'code_39', 'data_matrix', 'pdf417']; } async detect() { window.__calls++; return []; } }; });
  await p.goto(url, { waitUntil: 'networkidle0' });
  const t0 = Date.now(); await open(p);
  const ok = await p.waitForFunction(() => !document.querySelector('#scan-dialog')?.open && document.querySelector('#receipt-dialog')?.open && document.querySelector('#receipt-dialog').textContent.length > 0, { timeout: 30000 }).then(() => true, () => false);
  const r = { name, ok, ms: Date.now() - t0, nativeCalls: await p.evaluate(() => window.__calls), engine: await p.evaluate(() => localStorage.getItem('spitothiki:scan-engine')), errors };
  console.log(JSON.stringify(r)); if (!ok || errors.length) fail = true; await p.close();
}
console.log(fail ? 'FAIL' : 'PASS'); await b.close(); if (fail) process.exitCode = 1;
