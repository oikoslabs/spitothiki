// v1.6.16: the cart's price keypad (and every number field / dialog) is readable in light AND dark theme on a phone:
// text vs background contrast ≥ 4.5:1 for keypad keys and inputs. Screenshots of the cart price dialog. Demo data only.
// Usage: node tests/smoke/v1616-smoke.mjs <url> [shots-dir]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i).slice(0, 900)); } };
const errors = [];
const act = (pg, action, extra = {}) => pg.evaluate((a, x) => { const b = document.createElement('button'); b.dataset.action = a; Object.assign(b.dataset, x); b.hidden = true; document.body.append(b); b.click(); b.remove(); }, action, extra);
// Lowest text contrast among visible inputs / buttons inside `root` (selector).
const audit = (pg, root, sel = 'input:not([type=hidden]):not([type=checkbox]):not([type=file]), select, .keypad-key, .icon-button, .button') => pg.evaluate((root, sel) => {
  const rgb = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.a > 0.5) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
  const out = [];
  for (const el of document.querySelectorAll(`${root} :is(${sel})`)) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    const cs = getComputedStyle(el); const fill = cs.webkitTextFillColor && !/rgba\(0, 0, 0, 0\)/.test(cs.webkitTextFillColor) ? cs.webkitTextFillColor : cs.color;
    const fg = rgb(fill); const bg = bgOf(el); const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    out.push({ el: el.className || el.id || el.tagName, text: (el.value || el.textContent || '').trim().slice(0, 12), ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 });
  }
  return out;
}, root, sel);
const seed = { items: [], shopping: [{ id: 's1', name: 'Γάλα demo', quantity: 1, checked: true, updatedAt: 'x' }] };
for (const mode of ['light', 'dark', 'auto-dark']) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
  pg.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`));
  await pg.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: mode === 'light' ? 'light' : 'dark' }]);
  await pg.evaluateOnNewDocument(() => { window.__spitoProtect = true; });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate((s, m) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el');
    if (m !== 'auto-dark') localStorage.setItem('spitothiki:theme', m); localStorage.setItem('spitothiki:v1', JSON.stringify(s)); }, seed, mode);
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(600);
  // Cart: manual product → price dialog with the keypad; type 2,49 with the keypad.
  await pg.evaluate(() => { location.hash = '#cart'; }); await wait(500);
  const startBad = (await audit(pg, '#cart-start', 'input, select')).filter((x) => x.ratio < 4.5);
  check(`${mode}: cart start fields (store, budget) readable`, !startBad.length, startBad);
  await pg.type('#cart-new-store', 'Σούπερ demo'); await pg.evaluate(() => document.querySelector('#cart-start-form').requestSubmit()); await wait(600);
  await act(pg, 'cart-add-manual'); await wait(500);
  const open = await pg.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.id));
  for (const k of ['2', ',', '4', '9']) await pg.tap(`.keypad-key[data-key="${k}"]`);
  await pg.type('#cart-item-name', 'Ψωμί demo').catch(() => {});
  const keys = await audit(pg, 'dialog[open]');
  const low = keys.filter((x) => x.ratio < 4.5);
  check(`${mode}: cart price dialog open with keypad`, open.length && (await pg.$$('.keypad-key')).length >= 12, open);
  check(`${mode}: keypad keys + price field readable (contrast ≥ 4.5)`, keys.some((x) => /keypad/.test(x.el)) && !low.filter((x) => /keypad|price|field-input/.test(x.el)).length, low);
  check(`${mode}: price shows 2,49`, (await pg.$eval('#cart-item-price', (e) => e.value)) === '2,49');
  if (shots) await pg.screenshot({ path: `${shots}/cart-price-${mode}.png` });
  await pg.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  // Other money fields: bill dialog, transport, extras, shopping price.
  await act(pg, 'add-bill'); await wait(400);
  const bill = (await audit(pg, 'dialog[open]', 'input:not([type=hidden]):not([type=checkbox]):not([type=file]), select')).filter((x) => x.ratio < 4.5);
  check(`${mode}: bill dialog fields readable`, !bill.length, bill);
  await pg.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  for (const view of ['transport', 'extras', 'shopping']) {
    await pg.evaluate((v) => { location.hash = `#${v}`; }, view); await wait(500);
    const bad = (await audit(pg, '#view-content', 'input:not([type=hidden]):not([type=checkbox]):not([type=file]):not([type=range]), select')).filter((x) => x.ratio < 4.5);
    check(`${mode}: ${view} number/text fields readable`, !bad.length, bad);
  }
  await ctx.close();
}
check('no page errors', !errors.length, errors);
await browser.close(); console.log(failed ? `${failed} FAILED` : 'all ok'); process.exit(failed ? 1 : 0);
