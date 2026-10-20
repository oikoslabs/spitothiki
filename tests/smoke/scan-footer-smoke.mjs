// Footer «📷 Σάρωση» vs inner receipt scan with a fake camera showing a receipt QR (y4m).
// Usage: node tests/smoke/scan-footer-smoke.mjs <url> <video.y4m>
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', y4m = '/tmp/qr.y4m'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
let failed = false;
async function run(name, open, pre) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('spitothiki:onboarded', '1'); window.__gum = 0; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (c) => { window.__gum++; return g(c); }; });
  await page.goto(url, { waitUntil: 'networkidle0' });
  if (process.env.CPU) { const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) }); }
  if (pre) await pre(page);
  const t0 = Date.now();
  await open(page);
  await page.waitForFunction(() => document.querySelector('#scan-dialog')?.open, { timeout: 5000 }).catch(() => {});
  const ok = await page.waitForFunction(() => !document.querySelector('#scan-dialog')?.open && document.querySelector('#receipt-dialog')?.open, { timeout: 30000 }).then(() => true, () => false);
  const r = { name, ok, ms: Date.now() - t0, gum: await page.evaluate(() => window.__gum), status: await page.$eval('#scan-status', (e) => e.textContent).catch(() => ''), errors };
  console.log(JSON.stringify(r)); if (!ok || r.gum !== 1 || errors.length) failed = true; await page.close();
}
await run('footer scan', (p) => p.tap('.quick-bar-item[data-quick="scan"]'));
await run('home quick scan', (p) => p.tap('#home-quick .quick-action[data-quick="scan"]'));
await run('inner receipt scan', (p) => p.click('#receipt-dialog[open] [data-action="receipt-scan"]'), async (p) => { await p.evaluate(() => document.querySelector('[data-action="menu-receipt"]').click()); await p.waitForSelector('#receipt-dialog[open] [data-action="receipt-scan"]'); });
// Native BarcodeDetector stub (Android path): first frames give a partial 1D read, then the receipt QR.
// Old behaviour routed the partial read («Τι να κάνω;»); now it must wait and take the QR, and 'all' must split detectors.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('spitothiki:onboarded', '1'); window.__det = []; let n = 0;
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf', 'code_39', 'data_matrix', 'pdf417']; }
      constructor({ formats }) { this.f = formats; window.__det.push(formats); }
      async detect() { n++; if (n < 4) return this.f.includes('itf') ? [{ rawValue: '0042' }] : []; return this.f.includes('qr_code') ? [{ rawValue: 'https://epsilondigital-test.epsilonnet.gr/fd/ABC:1' }] : [{ rawValue: n % 2 ? '1234' : '5678' }]; } };
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.tap('.quick-bar-item[data-quick="scan"]');
  const ok = await page.waitForFunction(() => document.querySelector('#receipt-dialog')?.open, { timeout: 15000 }).then(() => true, () => false);
  const r = await page.evaluate(() => ({ det: window.__det, choice: document.querySelector('#choice-dialog')?.open }));
  const split = r.det.length === 2 && r.det[0].includes('qr_code') && !r.det[0].includes('ean_13');
  console.log(JSON.stringify({ name: 'native stub: partial read ignored, QR routed', ok, choice: r.choice, split }));
  if (!ok || r.choice || !split) failed = true; await page.close();
}
console.log(failed ? 'FAIL' : 'PASS'); if (failed) process.exitCode = 1;
await browser.close();
