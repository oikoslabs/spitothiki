// First-run setup: shown to a new user, 3 questions, presets become bill shortcuts, never shown to users with data,
// can be re-run from Settings. Usage: node tests/smoke/onboard-smoke.mjs <url> [width] [shotsDir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 390); const shots = process.argv[4];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = async (n, fn) => { let ok = false; try { ok = await fn(); } catch (e) { console.log(e.message); } console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); failed += !ok; };
const errors = [];
async function fresh(seed) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); await page.setBypassServiceWorker(true);
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  await page.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  if (seed) { await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('spitothiki:v1', JSON.stringify(s)); }, seed); await page.reload({ waitUntil: 'networkidle0' }); }
  return page;
}
const page = await fresh();
await check('new user: the 3 questions appear', async () => page.$eval('#onboard-dialog', (d) => d.open && d.querySelectorAll('h3').length === 3));
if (shots) await page.screenshot({ path: `${shots}/v11-after-firstrun-phone.png` });
await check('choose English, ΔΕΗ + road tax, large text → Start', async () => {
  await page.click('[data-action="onboard-lang"][data-lang="en"]'); await wait();
  await page.click('[data-action="onboard-bill"][data-id="dei"]'); await page.click('[data-action="onboard-bill"][data-id="road"]');
  await page.click('[data-action="onboard-size"][data-size="large"]'); await wait();
  const title = await page.$eval('#onboard-title', (e) => e.textContent);
  await page.click('#onboard-done'); await wait();
  const st = await page.evaluate(() => ({ open: document.querySelector('#onboard-dialog').open, lang: document.documentElement.lang, text: document.documentElement.dataset.text, flag: localStorage.getItem('spitothiki:onboarded') }));
  return title === 'Three quick questions' && !st.open && st.lang === 'en' && st.text === 'large' && st.flag === '1';
});
await check('bill shortcuts in Bills; tapping one opens a prefilled bill; it disappears once added', async () => {
  await page.evaluate(() => { location.hash = '#bills'; }); await wait(600);
  const chips = await page.$$eval('[data-action="bill-preset"]', (b) => b.map((x) => x.dataset.id));
  await page.click('[data-action="bill-preset"][data-id="road"]'); await wait();
  const f = await page.evaluate(() => ({ name: document.querySelector('#bill-name').value, type: document.querySelector('#bill-type').value, period: document.querySelector('#bill-period').value }));
  await page.$eval('#bill-amount', (e) => { e.value = '120'; }); await page.$eval('#bill-due', (e) => { e.value = '2026-12-31'; });
  await page.click('#bill-save'); await wait();
  const after = await page.$$eval('[data-action="bill-preset"]', (b) => b.map((x) => x.dataset.id));
  return chips.join() === 'dei,road' && f.name === 'Road tax' && f.type === 'tax' && f.period === '12' && after.join() === 'dei';
});
await check('reload: not shown again; Settings → «Ask me again» reopens it', async () => {
  await page.reload({ waitUntil: 'networkidle0' }); await wait();
  const closed = !(await page.$eval('#onboard-dialog', (d) => d.open));
  await page.evaluate(() => { location.hash = '#settings'; }); await wait(500);
  await page.click('[data-action="onboard-again"]'); await wait();
  const reopened = await page.$eval('#onboard-dialog', (d) => d.open);
  await page.click('[data-action="onboard-skip"]'); await wait();
  return closed && reopened;
});
const old = await fresh({ items: [{ id: 'i1', name: 'Γάλα', quantity: 1, unit: 'τεμ.', category: 'dairy', location: 'fridge', minimum: 0, expiry: '' }], shopping: [] });
await check('existing user with data: never shown', async () => !(await old.$eval('#onboard-dialog', (d) => d.open)) && (await old.evaluate(() => localStorage.getItem('spitothiki:onboarded'))) === '1');
await check('skip works for a new user', async () => {
  const p = await fresh(); await p.click('[data-action="onboard-skip"]'); await wait();
  return !(await p.$eval('#onboard-dialog', (d) => d.open)) && (await p.evaluate(() => localStorage.getItem('spitothiki:onboarded'))) === '1';
});
await browser.close();
if (errors.length) { console.log(errors); failed++; }
console.log(failed ? `onboard smoke ${width}: FAILED` : `onboard smoke ${width}: all ok`);
process.exit(failed ? 1 : 0);
