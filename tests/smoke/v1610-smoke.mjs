// v1.6.10: «Ξεκίνα» closes the first-run questions at once (heavy re-render after the paint); the receipt dialog opens
// without shifting when the receipt arrives (CLS 0) and has inner padding; the receipt detail offers «Μεταφορά στις
// Μετακινήσεις» only for fuel-looking receipts (2x2 buttons still fit); the scan dialog says «ΣΑΡΩΣΗ». Demo data only.
// Usage: node tests/smoke/v1610-smoke.mjs <url> [shots-dir]   (FIXTURES=<dir> if run outside the repo)
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const FIX = process.env.FIXTURES || new URL('../fixtures/', import.meta.url).pathname;
const RECEIPT = 'https://test-shop.epsilonnet.gr/fd/demo1610:1';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i)); } };
const errors = [];
async function phone({ width = 412, seed = null, lang = 'el', onboard = false } = {}) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.evaluateOnNewDocument((ob) => { if (ob) window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' });
    window.__ev = []; window.__ls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) __ev.push({ id: e.target?.id, name: e.name, d: e.duration, proc: e.processingEnd - e.processingStart }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) __ls.push(e.value); }).observe({ type: 'layout-shift', buffered: true }); }, onboard);
  await pg.setRequestInterception(true);
  pg.on('request', async (req) => { const u = decodeURIComponent(req.url());
    if (u.includes(RECEIPT)) { await wait(1200); const body = u.endsWith('/myDATA') ? readFileSync(FIX + 'receipt-mydata.xml', 'utf8') : u.endsWith('/EN16931') ? readFileSync(FIX + 'receipt-ubl.xml', 'utf8') : '<html></html>';
      return req.respond({ status: 200, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' }, body }); }
    return req.continue(); });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  if (!onboard) {
    await pg.evaluate((s, l) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', l); localStorage.setItem('spitothiki:v1', JSON.stringify(s || { items: [], shopping: [] })); }, seed, lang);
    await pg.reload({ waitUntil: 'networkidle0' }); await wait(600);
  }
  return { pg, ctx };
}
const act = (pg, action, extra = {}) => pg.evaluate((a, x) => { const b = document.createElement('button'); b.dataset.action = a; Object.assign(b.dataset, x); b.hidden = true; document.body.append(b); b.click(); b.remove(); }, action, extra);

// 1) First-run «Ξεκίνα»: the dialog is closed when the click handler returns; the app re-renders right after.
{
  const { pg, ctx } = await phone({ onboard: true });
  check('first-run questions shown', await pg.$eval('#onboard-dialog', (d) => d.open));
  await pg.tap('[data-action="onboard-bill"][data-id="dei"]'); await wait();
  const closedSync = await pg.evaluate(() => { document.querySelector('#onboard-done').click(); return !document.querySelector('#onboard-dialog').open; });
  check('«Ξεκίνα» closes the dialog in the same tap', closedSync);
  await wait(800);
  await pg.evaluate(() => { location.hash = '#bills'; }); await wait(600);
  check('the app re-rendered afterwards (ΔΕΗ shortcut in Bills, toast shown)', await pg.evaluate(() => Boolean(document.querySelector('[data-action="bill-preset"][data-id="dei"]')) && /Έτοιμο/.test(document.querySelector('#toast').textContent)));
  const { pg: p2, ctx: c2 } = await phone({ onboard: true });
  await p2.tap('#onboard-done'); await wait(900);
  const ev = await p2.evaluate(() => __ev.filter((e) => e.id === 'onboard-done' && e.name === 'click'));
  check('«Ξεκίνα» click handler is short (< 25 ms)', ev.length && ev.every((e) => e.proc < 25), ev);
  await ctx.close(); await c2.close();
}
// 2) Receipt dialog: padding, heading visible, no shift when the receipt arrives; no «fuel» offer for groceries.
for (const width of [360, 412]) {
  const { pg, ctx } = await phone({ width });
  await act(pg, 'open-receipt'); await wait(600);
  const pad = await pg.evaluate(() => { const d = document.querySelector('#receipt-dialog'); const c = getComputedStyle(d); return { top: parseFloat(c.paddingTop), left: parseFloat(c.paddingLeft), h: document.querySelector('#receipt-title').getBoundingClientRect().top - d.getBoundingClientRect().top }; });
  check(`${width}: receipt dialog has inner padding (heading not cut off)`, pad.top >= 20 && pad.left >= 18 && pad.h >= 18, pad);
  await pg.evaluate(() => { __ls = []; });
  await pg.type('#receipt-link-form input[name=link]', `${RECEIPT}/`); await pg.tap('#receipt-link-form button[type=submit]'); await wait(3500);
  const cls = await pg.evaluate(() => __ls.reduce((s, v) => s + v, 0));
  const lines = await pg.$$eval('#receipt-lines .receipt-line', (x) => x.length);
  check(`${width}: receipt arrives without the dialog shifting (CLS ${cls.toFixed(3)})`, lines > 0 && cls < 0.01, { cls, lines });
  check(`${width}: grocery receipt: no «Μοιάζει με απόδειξη καυσίμων»`, !(await pg.$('#receipt-transport')));
  if (shots) await pg.screenshot({ path: `${shots}/v1610-${width}-receipt-review.png` });
  await ctx.close();
}
// 3) Receipt detail: grocery (milk, olive oil in litres) → 3 buttons, no move; fuel → move offered. Nothing sticks out.
const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const grocery = [{ name: 'Demo γάλα 1L', quantity: 2, unit: 'λίτρα', price: 3.2 }, { name: 'Demo ελαιόλαδο 1L', quantity: 1, unit: 'λίτρα', price: 9.9 }, { name: 'Demo ψωμί', quantity: 1, unit: 'τεμ.', price: 1.8 }, { name: 'Demo ντομάτες', quantity: 1.2, unit: 'κιλά', price: 2.4 }];
const seed = { items: [], shopping: [], receipts: [
  { id: 'r-groc', store: 'Demo Σούπερ Μάρκετ', date: `${ym}-02`, total: 17.3, lines: 4, importedAt: `${ym}-02T10:00:00Z`, items: grocery },
  { id: 'r-fuel', store: 'Demo Πρατήριο Καυσίμων', date: `${ym}-03`, total: 45, lines: 1, importedAt: `${ym}-03T10:00:00Z`, items: [{ name: 'ΑΜΟΛΥΒΔΗ 95', quantity: 25, unit: 'λίτρα', price: 45 }] }],
  purchases: [...grocery.map((it, i) => ({ id: `pur-r-groc-${i}`, receiptId: 'r-groc', name: it.name, price: it.price, date: `${ym}-02` })), { id: 'pur-r-fuel-0', receiptId: 'r-fuel', name: 'ΑΜΟΛΥΒΔΗ 95', price: 45, date: `${ym}-03` }] };
for (const width of [360, 412]) {
  const { pg, ctx } = await phone({ width, seed });
  const detail = async (id) => {
    await act(pg, 'receipt-open', { id }); await wait(500);
    return pg.evaluate(() => {
      const d = document.querySelector('#receipt-detail-dialog'); if (!d.open) return null; const r = d.getBoundingClientRect();
      const btns = [...d.querySelectorAll('.dialog-actions .button')]; const h = d.querySelector('.dialog-heading').getBoundingClientRect(); const pt = parseFloat(getComputedStyle(d.querySelector('.dialog-heading')).paddingTop);
      const out = [...d.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width && b.height && (b.left < r.left - 1 || b.right > r.right + 1); }).length;
      const rows = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size;
      const res = { move: Boolean(d.querySelector('#receipt-move-transport')), buttons: btns.length, rows, out, headPad: pt, headInside: h.top >= r.top };
      d.close(); return res;
    });
  };
  const g = await detail('r-groc'); const f = await detail('r-fuel');
  check(`${width}: grocery detail: no «Μεταφορά», 3 buttons in ≤2 rows, nothing sticks out, heading padded`, g && !g.move && g.buttons === 3 && g.rows <= 2 && !g.out && g.headPad >= 20, g);
  check(`${width}: fuel detail: «Μεταφορά στις Μετακινήσεις» offered, 4 buttons in 2 rows`, f && f.move && f.buttons === 4 && f.rows === 2 && !f.out, f);
  if (shots) { await act(pg, 'receipt-open', { id: 'r-groc' }); await wait(400); await pg.screenshot({ path: `${shots}/v1610-${width}-detail-grocery.png` }); }
  await ctx.close();
}
// 4) Scan dialog heading: «ΣΑΡΩΣΗ» in Greek, «SCAN» in English.
for (const lang of ['el', 'en']) {
  const { pg, ctx } = await phone({ lang });
  const eyebrow = await pg.$eval('#scan-dialog .eyebrow', (e) => e.textContent.trim());
  check(`${lang}: scan dialog heading is ${lang === 'el' ? 'ΣΑΡΩΣΗ' : 'SCAN'}`, eyebrow === (lang === 'el' ? 'ΣΑΡΩΣΗ' : 'SCAN'), eyebrow);
  await ctx.close();
}
check('no page errors', !errors.length, errors);
console.log(failed ? `FAILED ${failed}` : 'PASS'); await browser.close(); if (failed) process.exitCode = 1;
