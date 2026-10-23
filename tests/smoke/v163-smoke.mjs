// v1.6.3: airier text (line-height 1.5, +0.1px letter-spacing, no negative letter-spacing) and clear feedback on onboarding choices. Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = '', tag = 'after'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
for (const width of [412, 360]) {
  const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
  const shot = async (n, el) => { if (!shots) return; const p = `${shots}/v163-${tag}-${width}-${n}.png`; if (el) await (await pg.$(el)).screenshot({ path: p }); else await pg.screenshot({ path: p }); };
  await pg.setViewport({ width, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [] })); });
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
  await shot('1-home');
  const neg = await pg.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => parseFloat(getComputedStyle(e).letterSpacing) < 0).map((e) => e.className || e.tagName).slice(0, 5));
  check(`${width}: no negative letter-spacing anywhere`, neg.length === 0, neg);
  const ls = await pg.evaluate(() => getComputedStyle(document.querySelector('.app-footer span')).letterSpacing);
  check(`${width}: body text has 0.1px letter-spacing`, ls === '0.1px', ls);
  check(`${width}: nothing sticks out sideways`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // onboarding
  await pg.evaluate(() => { localStorage.removeItem('spitothiki:onboarded'); }); await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
  check(`${width}: onboarding opens`, await pg.evaluate(() => document.querySelector('#onboard-dialog')?.open));
  const tap = (s) => pg.evaluate((s) => document.querySelector(s).click(), s);
  const bills = await pg.$$eval('[data-action="onboard-bill"]', (b) => b.map((x) => x.dataset.id));
  await tap(`[data-action="onboard-bill"][data-id="${bills[0]}"]`); await tap(`[data-action="onboard-bill"][data-id="${bills[2]}"]`); await tap('[data-action="onboard-size"][data-size="large"]'); await wait(300);
  const st = (id) => pg.$eval(`[data-action="onboard-bill"][data-id="${id}"]`, (b) => ({ p: b.getAttribute('aria-pressed'), bg: getComputedStyle(b).backgroundColor, tick: getComputedStyle(b, '::before').content }));
  const a = await st(bills[0]), off = await st(bills[1]);
  check(`${width}: picked bill is filled, ticked, aria-pressed`, a.p === 'true' && a.bg !== off.bg && a.tick.includes('✓'), { a, off });
  const sz = await pg.$eval('[data-action="onboard-size"][data-size="large"]', (b) => ({ p: b.getAttribute('aria-pressed'), tick: getComputedStyle(b, '::before').content }));
  check(`${width}: picked text size is ticked`, sz.p === 'true' && sz.tick.includes('✓'), sz);
  const lg = await pg.$eval('[data-action="onboard-lang"][aria-pressed="true"]', (b) => getComputedStyle(b, '::before').content);
  check(`${width}: chosen language is ticked`, lg.includes('✓'), lg);
  check(`${width}: modal fits the screen`, await pg.evaluate(() => document.querySelector('#onboard-dialog').scrollWidth <= document.querySelector('#onboard-dialog').clientWidth + 1));
  await shot('2-onboarding');
  await tap(`[data-action="onboard-bill"][data-id="${bills[0]}"]`); await wait(200);
  check(`${width}: tapping again un-picks it`, (await st(bills[0])).p === 'false');
  await tap('[data-action="onboard-size"][data-size="normal"]'); await wait(200);
  await pg.close();
}
await browser.close(); process.exit(failed ? 1 : 0);
