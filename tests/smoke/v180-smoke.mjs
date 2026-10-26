// v1.8.0: «＋ Έξοδο με το χέρι» (Αποδείξεις page, receipt dialog, scan failure), clear «not supported yet» message for a
// refused receipt domain, ΑΑΔΕ cash-register QR asks for the amount (never 0 €), receipt QR hint, quick-actions sheet entry,
// home screen unchanged, dialogs readable (≥ 4.5:1) in light / dark / auto-dark. Demo data only, network mocked.
// Usage: npm i --no-save puppeteer-core && node tests/smoke/v180-smoke.mjs <url>
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i).slice(0, 1500)); } };
const errors = [];
const SEL = 'button, a[href], summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]), textarea, [role=tab], [role=button], .filter-chip, .chip, .menu-item, .nav-item, .quick-bar-item';
const audit = (pg, root, one = false) => pg.evaluate((root, sel, one) => {
  const rgb = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 0.99) break; } }
    let bg = layers.length && layers[layers.length - 1].a >= 0.99 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 }; while (layers.length) bg = over(layers.pop(), bg); return bg; };
  const textNodes = (el) => [...el.querySelectorAll('*')].concat(el).filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent)));
  const out = [];
  const els = one ? [document.querySelector(root)] : [...document.querySelectorAll(root === 'body' ? sel : `${root} :is(${sel})`)];
  for (const el of els) {
    if (!el) continue; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || el.disabled || el.closest('[hidden], dialog:not([open])') || Number(cs.opacity) < 0.6) continue;
    const parts = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? [el] : textNodes(el).filter((t) => t.closest(':is(' + sel + ')') === el || t === el);
    for (const t of parts) {
      const ts = getComputedStyle(t); if (ts.visibility === 'hidden' || Number(ts.opacity) < 0.6) continue;
      const fill = ts.webkitTextFillColor && !/rgba\(0, 0, 0, 0\)/.test(ts.webkitTextFillColor) ? ts.webkitTextFillColor : ts.color;
      const bg = bgOf(t); const fg = over(rgb(fill), bg); const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const text = (t.value || t.placeholder || t.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
      if (!/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || text) out.push({ el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`, text, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100, bg: `${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}` });
    }
  }
  return out;
}, root, SEL, one);
const day = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const UNSUPPORTED = 'Οι αποδείξεις αυτού του καταστήματος δεν υποστηρίζονται ακόμα';
const stored = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')));
const openLink = async (pg, link) => {
  await pg.evaluate(() => { location.hash = '#receipts'; }); await wait(400);
  await pg.click('#view-content [data-action="menu-receipt"]'); await wait(300);
  await pg.$eval('#receipt-link-form input[name="link"]', (el, v) => { el.value = v; }, link);
  await pg.$eval('#receipt-link-form', (f) => f.requestSubmit()); await wait(900);
};
for (const mode of ['light', 'dark', 'auto-dark']) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
  pg.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`));
  await pg.setRequestInterception(true);
  pg.on('request', (req) => {
    const u = req.url();
    if (u.includes('workers.dev')) return req.respond({ status: 403, headers: { 'access-control-allow-origin': '*' }, contentType: 'text/plain', body: 'Domain not allowed' });
    if (u.includes('demo-shop.example')) return req.abort('failed'); // CORS-style failure → proxy
    return req.continue();
  });
  await pg.setViewport({ width: 412, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: mode === 'auto-dark' ? 'dark' : 'light' }]);
  // Seed before the app's scripts run (once per context), so nothing can overwrite it on reload.
  await pg.evaluateOnNewDocument((m) => { window.__spitoProtect = true;
    if (sessionStorage.getItem('v180-seeded')) return; sessionStorage.setItem('v180-seeded', '1');
    localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el');
    if (m !== 'auto-dark') localStorage.setItem('spitothiki:theme', m === 'dark' ? 'dark' : 'light');
    localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], expenseCategories: [{ id: 'ec-demo', name: 'Κρέας demo', emoji: '🥩', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] })); }, mode);
  await pg.goto(url, { waitUntil: 'networkidle0' }); await wait(500);

  // Home screen stays clean: same quick grid, no new button.
  const home = await pg.evaluate(() => ({ quick: document.querySelectorAll('#home-quick [data-quick]').length, manual: Boolean(document.querySelector('#view-content [data-action="receipt-manual"], #view-content [data-quick="manual"]')) }));
  check(`${mode}: home screen unchanged`, home.quick === 6 && !home.manual, home);

  // 1) Αποδείξεις → «＋ Έξοδο με το χέρι» → save 23,40 € «Κρεοπωλείο demo» in «Κρέας demo».
  await pg.evaluate(() => { location.hash = '#receipts'; }); await wait(400);
  await pg.click('#receipts-manual'); await wait(400);
  const form = await pg.evaluate(() => ({ open: document.querySelector('#receipt-dialog').open, date: document.querySelector('#manual-date')?.value, cats: [...document.querySelectorAll('#manual-expcat option')].map((o) => o.textContent) }));
  check(`${mode}: manual form opens with today and the shared categories`, form.open && form.date === day && /Αγορές/.test(form.cats[0]) && form.cats.some((c) => /Κρέας demo/.test(c)), form);
  const low = (await audit(pg, '#receipt-dialog')).filter((x) => x.ratio < 4.5);
  check(`${mode}: manual form readable`, !low.length, low);
  await pg.click('#manual-save'); await wait(200);
  const err = await pg.evaluate(() => ({ shown: !document.querySelector('#manual-error').hidden, text: document.querySelector('#manual-error').textContent }));
  check(`${mode}: empty amount refused`, err.shown && /μεγαλύτερο από 0/.test(err.text), err);
  await pg.type('#manual-amount', '23.40'); await pg.type('#manual-store', 'Κρεοπωλείο demo'); await pg.select('#manual-expcat', 'ec-demo');
  await pg.click('#manual-save'); await wait(500);
  let s = await stored(pg);
  const r1 = s.receipts?.[0]; const p1 = s.purchases?.find((p) => p.receiptId === r1?.id);
  check(`${mode}: manual expense saved like a total-only receipt`, r1?.format === 'manual' && r1.total === 23.4 && r1.store === 'Κρεοπωλείο demo' && r1.date === day && p1?.price === 23.4 && p1.expenseCategory === 'ec-demo', { r1, p1 });
  const listed = await pg.evaluate(() => document.querySelector('#receipts-list')?.textContent || '');
  check(`${mode}: shows in Αποδείξεις`, /Κρεοπωλείο demo/.test(listed) && /23,40/.test(listed), listed);
  await pg.evaluate(() => { location.hash = '#overview'; }); await wait(400);
  const month = await pg.evaluate(() => document.querySelector('#home-month-total')?.textContent || '');
  check(`${mode}: counted in «Τα έξοδα του μήνα»`, /23,40/.test(month), month);

  // 2) Refused domain → plain «not supported yet» + «＋ Έξοδο με το χέρι» (no «Δεν βρέθηκαν είδη» / «δοκίμασε αργότερα»).
  await openLink(pg, 'https://receipts.demo-shop.example/v/demo-123');
  const fail = await pg.evaluate(() => ({ error: document.querySelector('#receipt-error')?.textContent || '', manual: Boolean(document.querySelector('#receipt-manual-error')), hint: document.querySelector('#receipt-qr-hint')?.textContent || '' }));
  check(`${mode}: refused shop → «δεν υποστηρίζονται ακόμα» + manual button`, fail.error.startsWith(UNSUPPORTED) && fail.manual && !/Δεν βρέθηκαν είδη|αργότερα/.test(fail.error), fail);
  check(`${mode}: receipt QR hint`, /όχι την κάρτα πόντων ή το barcode του ταμείου/.test(fail.hint), fail.hint);
  const lowFail = (await audit(pg, '#receipt-dialog')).filter((x) => x.ratio < 4.5);
  check(`${mode}: failure screen readable`, !lowFail.length, lowFail);
  await pg.click('#receipt-manual-error'); await wait(300);
  check(`${mode}: failure → manual form`, await pg.evaluate(() => Boolean(document.querySelector('#receipt-manual-form'))));
  await pg.click('[data-action="receipt-reset"]'); await wait(200);
  await pg.evaluate(() => document.querySelector('#receipt-dialog').close());

  // 3) ΑΑΔΕ cash-register QR (no amount) → asks the amount; never a 0 € expense.
  const before = (await stored(pg)).purchases.length;
  await openLink(pg, 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DEMO' + mode);
  const aade = await pg.evaluate(() => ({ note: Boolean(document.querySelector('#manual-aade-note')), form: Boolean(document.querySelector('#receipt-manual-form')) }));
  check(`${mode}: ΑΑΔΕ QR asks for the amount`, aade.note && aade.form, aade);
  check(`${mode}: nothing saved before the amount`, (await stored(pg)).purchases.length === before);
  await pg.type('#manual-amount', '7,20'.replace(',', '.')); await pg.click('#manual-save'); await wait(500);
  s = await stored(pg);
  const r2 = s.receipts.find((r) => r.format === 'AADE');
  check(`${mode}: ΑΑΔΕ receipt saved with the typed amount`, r2?.total === 7.2 && s.purchases.some((p) => p.receiptId === r2.id && p.price === 7.2) && !s.purchases.some((p) => !(p.price > 0)), { r2 });
  await openLink(pg, 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DEMO' + mode);
  const dup = await pg.evaluate(() => ({ manual: Boolean(document.querySelector('#receipt-manual-form')), dup: Boolean(document.querySelector('#receipt-duplicate')) }));
  check(`${mode}: same ΑΑΔΕ QR twice → «ήδη εισαχθεί»`, !dup.manual && dup.dup, dup);
  await pg.evaluate(() => document.querySelector('#receipt-dialog').close());

  // 4) Quick-actions sheet («⚡ Κινήσεις») has it; the scanner's torch button stays hidden without a camera.
  await pg.click('.quick-bar [data-quick="all"]'); await wait(300);
  const sheet = await pg.evaluate(() => Boolean(document.querySelector('#quick-sheet-list [data-quick="manual"]')));
  check(`${mode}: «Έξοδο με το χέρι» in Κινήσεις`, sheet);
  await pg.click('#quick-sheet-list [data-quick="manual"]'); await wait(300);
  check(`${mode}: Κινήσεις → manual form`, await pg.evaluate(() => Boolean(document.querySelector('#receipt-dialog[open] #receipt-manual-form'))));
  await pg.evaluate(() => document.querySelector('#receipt-dialog').close());
  await pg.evaluate(() => { location.hash = '#receipts'; }); await wait(300);
  await pg.click('#view-content [data-action="menu-receipt"]'); await wait(200);
  await pg.click('[data-action="receipt-scan"]'); await wait(1200);
  check(`${mode}: torch hidden when unsupported`, await pg.evaluate(() => document.querySelector('#scan-torch').hidden));
  await ctx.close();
}
check('no page errors', !errors.length, errors);
await browser.close();
process.exit(failed ? 1 : 0);
