// v1.8.0: receipt-link failures against the REAL network and the deployed receipt proxy (no mocks). Demo links only.
//   unknown shop  → «δεν υποστηρίζονται ακόμα» + «＋ Έξοδο με το χέρι», no offline box
//   known provider, host unreachable → «δεν απαντά… δοκίμασε ξανά», no offline box
//   phone offline → «δεν υπάρχει internet» + «💾 Αποθήκευση για αργότερα»
// Usage: npm i --no-save puppeteer-core && node tests/smoke/v180-receipt-errors-smoke.mjs <url>
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i).slice(0, 800)); } };
const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
await pg.setViewport({ width: 412, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await pg.evaluateOnNewDocument(() => { window.__spitoProtect = true; if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el'); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [] })); });
await pg.goto(url, { waitUntil: 'networkidle0' }); await wait(500);
const tryLink = async (link, ms = 20000) => {
  await pg.evaluate(() => { const d = document.querySelector('#receipt-dialog'); if (d.open) d.close(); location.hash = '#receipts'; }); await wait(400);
  await pg.click('#view-content [data-action="menu-receipt"]'); await wait(300);
  await pg.$eval('#receipt-link-form input[name="link"]', (el, v) => { el.value = v; }, link);
  await pg.$eval('#receipt-link-form', (f) => f.requestSubmit());
  await pg.waitForFunction(() => !document.querySelector('#receipt-loading'), { timeout: ms }); await wait(200);
  return pg.evaluate(() => ({ error: document.querySelector('#receipt-error')?.textContent || '', manual: Boolean(document.querySelector('#receipt-manual-error')), later: Boolean(document.querySelector('#receipt-save-later')) }));
};
const a = await tryLink('https://receipts.demo-shop.example/v/1');
check('unknown shop → «δεν υποστηρίζονται ακόμα», manual button, no offline box', /δεν υποστηρίζονται ακόμα/.test(a.error) && a.manual && !a.later, a);
const b = await tryLink('https://epsilondigital-nohost-demo.epsilonnet.gr/fd/demo');
check('known provider, unreachable host → «δεν απαντά… δοκίμασε ξανά», no offline box', /δεν απαντά/.test(b.error) && !/internet/.test(b.error) && b.manual && !b.later, b);
await pg.setOfflineMode(true); await wait(300);
const c = await tryLink('https://epsilondigital-demo.epsilonnet.gr/fd/demo');
check('phone offline → «δεν υπάρχει internet» + «Αποθήκευση για αργότερα»', /internet/.test(c.error) && c.later, c);
await pg.setOfflineMode(false);
await browser.close();
process.exit(failed ? 1 : 0);
