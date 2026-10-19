// Phone screenshots of the main screens (used for before/after comparisons).
// Usage: node tests/smoke/v11-shots.mjs <url> <prefix>   e.g. /workspace/spitothiki_qa/v11-before
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', prefix = '/tmp/v11'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.setItem('spitothiki:onboarded', '1'); });
await page.reload({ waitUntil: 'networkidle0' });
// a bit of demo data so screens are not empty
await page.evaluate(() => { const b = [...document.querySelectorAll('[data-action="load-demo"]')][0]; b?.click(); });
await new Promise((r) => setTimeout(r, 500));
for (const view of ['overview', 'pantry', 'bills', 'settings']) {
  await page.evaluate((v) => { location.hash = `#${v}`; }, view);
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${prefix}-${view}-phone.png` });
}
await browser.close();
