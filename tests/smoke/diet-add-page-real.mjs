// Real Tesseract (no mock) on generated anonymised pages: checks the ➕ is visible in every review state and on the saved plan.
// Usage: node tests/smoke/diet-add-page-real.mjs <url> [screenshot]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shot = ''] = process.argv.slice(2);
const fx = (n) => new URL(`../fixtures/${n}`, import.meta.url).pathname;
const FRONT = fx('diet-front.png'); const BACK = fx('diet-back.png');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const results = []; let failed = false;
async function run(name, { lang = 'el', big = false, files = [FRONT], thenAdd = null, saved = false, pdf = false } = {}) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((lang) => Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') }), lang);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); location.hash = '#cook'; });
  await page.reload({ waitUntil: 'networkidle0' });
  if (big) await page.addStyleTag({ content: 'html{font-size:150% !important}' });
  await page.click('[data-action="cook-tab"][data-tab="plan"]');
  await page.waitForSelector('#diet-file');
  const hint = await page.$('#diet-two-hint');
  await (await page.$('#diet-file')).uploadFile(...files);
  await page.waitForSelector('#diet-dialog[open] #diet-review', { timeout: 300000 });
  const vis = () => page.evaluate(() => { const b = document.querySelector('#diet-dialog[open] #diet-add-page'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const r = { name, hint: Boolean(hint), afterScan: await vis(), count: await page.$eval('#diet-count', (e) => e.textContent) };
  if (thenAdd) { await (await page.$('#diet-add-page input')).uploadFile(thenAdd); await page.waitForFunction(() => document.querySelector('#diet-pages')?.textContent.startsWith('2'), { timeout: 300000 }); r.afterAdd = await page.$eval('#diet-count', (e) => e.textContent); r.addVisible = await vis(); }
  if (saved) {
    await page.click('#diet-save'); await page.waitForSelector('#diet-add-saved');
    r.savedButton = await page.$eval('#diet-add-saved', (b) => b.getBoundingClientRect().height > 0);
    if (shot) { await page.evaluate(() => document.querySelector('#diet-section').scrollIntoView({ behavior: 'instant' })); await new Promise((x) => setTimeout(x, 400)); await page.screenshot({ path: shot }); }
    await (await page.$('#diet-add-saved input')).uploadFile(BACK);
    await page.waitForFunction(() => document.querySelector('#diet-pages')?.textContent.startsWith('2') && !document.querySelector('#diet-busy'), { timeout: 300000 });
    r.savedMerged = await page.$eval('#diet-count', (e) => e.textContent);
    await page.click('#diet-save'); await page.waitForSelector('#diet-week');
    r.savedOptions = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).dietPlans[0].slots.map((s) => s.options.length));
  }
  r.errors = errors;
  const ok = r.afterScan && !errors.length && (!thenAdd || r.addVisible) && (!saved || r.savedButton);
  if (!ok) failed = true; results.push({ ok, ...r }); await page.close();
}
await run('front only, Greek', { thenAdd: BACK });
await run('both photos at once', { files: [FRONT, BACK] });
await run('English', { lang: 'en' });
await run('extra-large text', { big: true });
await run('saved plan add page', { saved: true });
console.log(JSON.stringify(results, null, 1));
console.log(failed ? 'FAIL' : 'PASS'); if (failed) process.exitCode = 1;
await browser.close();
