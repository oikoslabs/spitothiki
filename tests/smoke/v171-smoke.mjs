// v1.7.1: «Φόρος εισοδήματος (8 δόσεις)» chip in a new bill: prefills next end-of-month due date and instalment,
// saves, shows «δόση N από 8», and the dialog is readable (≥ 4.5:1) in light / dark / auto-dark. Demo data only.
// Usage: npm i --no-save puppeteer-core && node tests/smoke/v171-smoke.mjs <url>
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
const day = new Date().toISOString().slice(0, 10);
const seed = { bills: [{ id: 'b1', name: 'ΔΕΗ demo', type: 'electricity', amount: 80, due: day, period: 1, paid: false, updatedAt: day }] };
for (const mode of ['light', 'dark', 'auto-dark']) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
  pg.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`));
  await pg.setViewport({ width: 412, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: mode === 'auto-dark' ? 'dark' : 'light' }]);
  await pg.evaluateOnNewDocument(() => { window.__spitoProtect = true; });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate((s, m) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el');
    if (m !== 'auto-dark') localStorage.setItem('spitothiki:theme', m === 'dark' ? 'dark' : 'light'); localStorage.setItem('spitothiki:v1', JSON.stringify(s)); }, seed, mode);
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(500);
  await pg.evaluate(() => { location.hash = '#bills'; }); await wait(500);
  await pg.click('[data-action="add-bill"]'); await wait(300);
  await pg.click('#bill-chips [data-plan="incometax"]'); await wait(200);
  const f = await pg.evaluate(() => { const e = document.querySelector('#bill-form').elements; return { name: e.name.value, type: e.type.value, period: e.period.value, due: e.due.value, n: e.installment.value, total: e.installments.value, open: document.querySelector('#bill-installments').open }; });
  check(`${mode}: chip prefills income tax`, f.name === 'Φόρος εισοδήματος' && f.type === 'tax' && f.period === '1' && /^\d{4}-\d{2}-(28|29|30|31)$/.test(f.due) && f.total === '8' && Number(f.n) >= 1 && f.open, f);
  const low = (await audit(pg, '#bill-dialog')).filter((x) => x.ratio < 4.5);
  check(`${mode}: bill dialog readable`, !low.length, low);
  await pg.type('#bill-amount', '120'); await pg.click('#bill-save'); await wait(500);
  const meta = await pg.evaluate(() => [...document.querySelectorAll('.bill-installment')].map((e) => e.textContent));
  check(`${mode}: list shows instalment`, meta.length === 1 && meta[0] === `δόση ${f.n} από 8`, meta);
  const stored = await pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).bills.find((b) => b.type === 'tax'));
  check(`${mode}: saved with instalments`, stored?.installments === 8 && stored?.installment === Number(f.n), stored);
  await ctx.close();
}
check('no page errors', !errors.length, errors);
await browser.close();
process.exit(failed ? 1 : 0);
