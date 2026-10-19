// Android-Chrome-like run of bill PDF import: Moto G4 UA/viewport, 4x CPU throttle, SW enabled (upgrade path),
// every fixture PDF; reports time until provider/amount/due appear and any console errors / rejections / 404s.
// Usage: node tests/smoke/bill-android-smoke.mjs <url> [--hang-ocr]
import puppeteer, { KnownDevices } from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const hang = process.argv.includes('--hang-ocr');
const pdf = (name) => new URL(`../fixtures/bills/${name}`, import.meta.url).pathname;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.emulate(KnownDevices['Moto G4']);
await page.emulateCPUThrottling(4);
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/cloudflareinsights|ERR_FAILED|Parameter not found|Estimating resolution/.test(m.text())) problems.push(`console ${m.text()}`); });
page.on('requestfailed', (r) => { if (!/cloudflareinsights/.test(r.url())) problems.push(`failed ${r.url()}`); });
page.on('response', (r) => { if (r.status() >= 400 && !/cloudflareinsights|favicon/.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });
await page.goto(`${url}#bills`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' }); // second load is served by the SW
const sw = await page.evaluate(async () => (await navigator.serviceWorker?.getRegistration())?.active?.scriptURL || 'none');
if (hang) await page.evaluate(() => { window.__spitoOcrMock = () => new Promise(() => {}); window.__spitoBillCodesMock = () => new Promise(() => {}); });
let failed = 0;
const cases = [['dei.pdf', 'ΔΕΗ', '86.4'], ['cosmote.pdf', 'Cosmote', '32.9'], ['vodafone-columns.pdf', 'Vodafone', '32.45'], ['nova-epc.pdf', 'Nova', hang ? '' : '49.6']];
for (const [file, name, amount] of cases) {
  const t0 = Date.now();
  await (await page.$('#bill-file')).uploadFile(pdf(file));
  const got = await page.waitForFunction((n) => document.querySelector('#bill-name')?.value === n, { timeout: 20000 }, name).then(() => Date.now() - t0, () => null);
  await page.waitForFunction(() => !/Looking for|Αναζήτηση για|Ανάγνωση|Reading|reading it as an image|αναγνώριση από εικόνα/.test(document.querySelector('#bill-scan-status').textContent), { timeout: 90000 }).catch(() => {});
  const f = await page.evaluate(() => ({ amount: document.querySelector('#bill-amount').value, due: document.querySelector('#bill-due').value, ref: document.querySelector('#bill-reference').value, status: document.querySelector('#bill-scan-status').textContent }));
  const ok = got != null && f.amount === amount && f.ref;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: name after ${got}ms`, JSON.stringify(f)); failed += !ok;
  await page.click('[data-action="close-bill"]').catch(() => {});
}
console.log('sw', sw, 'problems', problems);
await browser.close();
process.exit(failed || problems.length ? 1 : 0);
