// v1.6.9: no dialog content (buttons especially) may stick out sideways at 360/412 px, light and dark;
// action rows wrap; the round ⬆ never covers a dialog's buttons; the page ⬆ hides while a dialog is open. Demo data only.
// Usage: node tests/smoke/v169-smoke.mjs <url> [shots-dir]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i)); } };
const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const at = '2026-10-01T00:00:00Z';
const items = Array.from({ length: 14 }, (_, i) => ({ name: `Demo είδος με μεγάλο όνομα προϊόντος ${i + 1} 200g`, quantity: i % 3 ? 1 : 0.348, price: 1 + i }));
const demo = { items: [], shopping: [], receipts: [{ id: 'r-demo', store: 'Demo Σούπερ Μάρκετ', date: `${ym}-01`, total: 119, importedAt: at, url: 'https://example.com/receipt', items }],
  purchases: items.map((it, i) => ({ id: `pur-r-demo-${i}`, receiptId: 'r-demo', name: it.name, price: it.price, date: `${ym}-01` })) };
// Elements that stick out of the dialog's box (sideways), and whether the dialog scrolls sideways.
const measure = (pg, id) => pg.evaluate((id) => {
  const d = document.getElementById(id); if (!d?.open) return null;
  const r = d.getBoundingClientRect();
  const out = [...d.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width && b.height && getComputedStyle(el).visibility !== 'hidden' && (b.left < r.left - 1 || b.right > r.right + 1); })
    .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}`).slice(0, 5);
  return { out, sideScroll: d.scrollWidth > d.clientWidth + 1, inViewport: r.left >= 0 && r.right <= innerWidth };
}, id);
for (const theme of ['light', 'dark']) for (const width of [360, 412]) {
  const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
  await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate((d, th) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el'); localStorage.setItem('spitothiki:theme', th); localStorage.setItem('spitothiki:v1', JSON.stringify(d)); }, demo, theme);
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(700);
  const tag = `${theme} ${width}`;
  // Receipt details (4 buttons) and its edit form, as in the user's report.
  await pg.evaluate(() => { const b = document.createElement('button'); b.dataset.view = 'receipts'; b.hidden = true; document.body.append(b); b.click(); b.remove(); }); await wait(600);
  await pg.evaluate(() => { window.scrollTo(0, 2000); }); await wait(200);
  await pg.evaluate(() => document.querySelector('[data-action="receipt-open"]').click()); await wait(400);
  let m = await measure(pg, 'receipt-detail-dialog');
  check(`${tag}: receipt details: nothing sticks out`, m && !m.out.length && !m.sideScroll && m.inViewport, m);
  check(`${tag}: page ⬆ hidden while a dialog is open`, await pg.evaluate(() => { const b = document.querySelector('.back-to-top-page'); return !b || b.hidden || getComputedStyle(b).display === 'none'; }));
  // Scroll the dialog to the bottom: its own ⬆ must not cover any action button.
  await pg.evaluate(() => { const d = document.querySelector('#receipt-detail-dialog'); d.scrollTop = 0; d.scrollTop = d.scrollHeight; d.dispatchEvent(new Event('scroll')); }); await wait(400);
  const cover = await pg.evaluate(() => {
    const d = document.querySelector('#receipt-detail-dialog'); const fab = d.querySelector('.back-to-top-dialog');
    if (!fab || fab.hidden || getComputedStyle(fab).display === 'none') return [];
    const f = fab.getBoundingClientRect();
    return [...d.querySelectorAll('.dialog-actions .button')].filter((b) => { const r = b.getBoundingClientRect(); return !(r.right <= f.left || r.left >= f.right || r.bottom <= f.top || r.top >= f.bottom); }).map((b) => b.textContent.trim());
  });
  check(`${tag}: dialog ⬆ doesn't cover the buttons`, !cover.length, cover);
  if (shots) await pg.screenshot({ path: `${shots}/v169-${theme}-${width}-detail.png` });
  await pg.evaluate(() => document.querySelector('#receipt-edit').click()); await wait(400);
  await pg.evaluate(() => { const d = document.querySelector('#receipt-detail-dialog'); d.scrollTop = d.scrollHeight; }); await wait(200);
  m = await measure(pg, 'receipt-detail-dialog');
  check(`${tag}: receipt edit form: nothing sticks out`, m && !m.out.length && !m.sideScroll, m);
  if (shots) await pg.screenshot({ path: `${shots}/v169-${theme}-${width}-edit.png` });
  await pg.evaluate(() => document.querySelector('#receipt-detail-dialog').close());
  // Every other dialog, opened as is.
  const ids = await pg.$$eval('dialog', (ds) => ds.map((d) => d.id).filter((id) => id && !['receipt-detail-dialog', 'menu-sheet', 'quick-sheet'].includes(id)));
  const bad = [];
  for (const id of ids) {
    await pg.evaluate((id) => { const d = document.getElementById(id); for (const h of d.querySelectorAll('[hidden]')) if (h.closest('.dialog-actions')) h.dataset.wasHidden = '1'; d.showModal(); }, id); await wait(120);
    const r = await measure(pg, id);
    if (r && (r.out.length || r.sideScroll || !r.inViewport)) bad.push({ id, ...r });
    await pg.evaluate((id) => document.getElementById(id).close(), id);
  }
  check(`${tag}: all ${ids.length} other dialogs: nothing sticks out`, !bad.length, bad);
  check(`${tag}: no page errors`, !errors.length, errors);
  await pg.close();
}
console.log(failed ? `FAILED ${failed}` : 'PASS'); await browser.close(); if (failed) process.exitCode = 1;
