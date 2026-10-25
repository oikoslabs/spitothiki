// v1.6.17: every visible interactive element (menu items, sidebar / bottom bar items, tabs, chips, buttons, fields),
// incl. active / hover / focus states, has text contrast ≥ 4.5:1 in light, dark, auto-dark and high contrast at 412px.
// Bug: dark theme phone menu, active item («🚗 Μετακινήσεις») was a near-white background with near-white text. Demo data only.
// Usage: node tests/smoke/v1617-smoke.mjs <url> [shots-dir]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i).slice(0, 1500)); } };
const errors = [];
const SEL = 'button, a[href], summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]), textarea, [role=tab], [role=button], .filter-chip, .chip, .menu-item, .nav-item, .quick-bar-item';
// Text contrast of matching elements (only those showing letters or digits). `one` = audit just that element.
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
const low = (list) => list.filter((x) => x.ratio < 4.5);
const day = new Date().toISOString().slice(0, 10);
const seed = {
  items: [{ id: 'i1', name: 'Γάλα demo', category: 'Γαλακτοκομικά', quantity: 1, unit: 'τεμ.', minQuantity: 2, updatedAt: day }, { id: 'i2', name: 'Ρύζι demo', category: 'Άλλο', quantity: 3, unit: 'τεμ.', updatedAt: day }],
  shopping: [{ id: 's1', name: 'Ψωμί demo', quantity: 1, checked: false, updatedAt: day }],
  bills: [{ id: 'b1', name: 'ΔΕΗ demo', type: 'electricity', amount: 80, due: day, paid: false, createdAt: day, updatedAt: day }],
  transport: [{ id: 't1', type: 'tolls', amount: 2.4, date: day, createdAt: day, updatedAt: day }],
  extras: [{ id: 'x1', category: 'coffee', amount: 3.5, qty: 1, date: day, createdAt: day, updatedAt: day }],
  chores: [{ id: 'c1', name: 'Υδραυλικός demo', emoji: '🔧', every: 7, remind: true, assignee: '', history: [], start: day, createdAt: day, updatedAt: day }]
};
const VIEWS = ['overview', 'pantry', 'shopping', 'cart', 'cook', 'bills', 'transport', 'extras', 'chores', 'insights', 'receipts', 'settings'];
for (const mode of ['light', 'dark', 'auto-dark', 'high-contrast', 'dark-high-contrast']) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
  pg.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`));
  await pg.setViewport({ width: 412, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: mode === 'auto-dark' ? 'dark' : 'light' }]);
  await pg.evaluateOnNewDocument(() => { window.__spitoProtect = true; });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate((s, m) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el');
    if (m !== 'auto-dark') localStorage.setItem('spitothiki:theme', m.startsWith('dark') ? 'dark' : 'light'); if (m.includes('high-contrast')) localStorage.setItem('spitothiki:contrast', 'high'); localStorage.setItem('spitothiki:v1', JSON.stringify(s)); }, seed, mode);
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(600);
  // 1) The reported bug: phone menu with «Μετακινήσεις» active, plus hover / focus of every menu item.
  await pg.evaluate(() => { location.hash = '#transport'; }); await wait(500);
  await pg.click('[data-action="open-menu"]'); await wait(500);
  const active = await audit(pg, '#menu-sheet .menu-item.is-active', true);
  check(`${mode}: active menu item («Μετακινήσεις») readable`, active.length > 0 && !low(active).length, active);
  if (shots) await pg.screenshot({ path: `${shots}/menu-${mode}.png` });
  const states = [];
  for (const h of await pg.$$('#menu-sheet .menu-item')) {
    await h.hover(); states.push(...(await h.evaluate((e) => { e.dataset.probe = '1'; return 1; }), await audit(pg, '#menu-sheet [data-probe]', true)));
    await h.focus(); states.push(...await audit(pg, '#menu-sheet [data-probe]', true)); await h.evaluate((e) => delete e.dataset.probe);
  }
  check(`${mode}: every menu item readable on hover / focus (${states.length})`, states.length > 10 && !low(states).length, low(states));
  await pg.keyboard.press('Escape'); await wait(300);
  // 2) Generic sweep of every view; the bottom bar and the active / hovered bottom bar item too.
  const bad = [];
  for (const v of VIEWS) {
    await pg.evaluate((x) => { location.hash = `#${x}`; }, v); await wait(450);
    await pg.evaluate(() => document.querySelectorAll('details.collapsible').forEach((d) => { d.open = true; }));
    await wait(100);
    for (const x of low(await audit(pg, 'body'))) bad.push({ view: v, ...x });
    for (const h of await pg.$$('.quick-bar-item, .filter-chip, [role=tab]')) {
      if (!(await h.boundingBox())) continue;
      await h.hover().catch(() => {}); await h.evaluate((e) => { e.dataset.probe = '1'; });
      for (const x of low(await audit(pg, '[data-probe]', true))) bad.push({ view: v, state: 'hover', ...x });
      await h.evaluate((e) => delete e.dataset.probe);
    }
  }
  const uniq = [...new Map(bad.map((x) => [`${x.el}|${x.text}|${x.state || ''}`, x])).values()];
  check(`${mode}: every visible button / tab / chip / field in all ${VIEWS.length} views ≥ 4.5:1`, !uniq.length, uniq);
  await ctx.close();
}
check('no page errors', !errors.length, errors);
await browser.close(); console.log(failed ? `${failed} FAILED` : 'all ok'); process.exit(failed ? 1 : 0);
