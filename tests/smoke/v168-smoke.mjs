// v1.6.8: own expense categories. Create «👕 Ρούχα» inline from a receipt's ✎ Διόρθωση, move one line into it,
// check «Σύνολο εξόδων» (own row, Αγορές lowered, same grand total), move a small expense, delete → fallback,
// English labels, dark mode contrast of the new parts. Demo data only.
// Usage: node tests/smoke/v168-smoke.mjs <url> [shots-dir]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i)); } };
const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const d1 = `${ym}-01`, d2 = `${ym}-02`, at = '2026-10-01T00:00:00Z';
const demo = { items: [], shopping: [],
  receipts: [{ id: 'r-demo', store: 'Demo Market', date: d1, total: 16.5, importedAt: at, items: [{ name: 'Ψωμί', quantity: 1, price: 1.5 }, { name: 'Μπλουζάκι', quantity: 1, price: 15 }] }],
  purchases: [{ id: 'pur-r-demo-0', receiptId: 'r-demo', name: 'Ψωμί', price: 1.5, date: d1, category: 'Ξηρά τρόφιμα', updatedAt: at }, { id: 'pur-r-demo-1', receiptId: 'r-demo', name: 'Μπλουζάκι', price: 15, date: d1, category: 'Άλλο', updatedAt: at }],
  extraCategories: [{ id: 'xc-coffee', name: 'Καφές', emoji: '☕', createdAt: at, updatedAt: at }],
  extras: [{ id: 'xe-1', category: 'xc-coffee', amount: 4, qty: 1, date: d2, note: '', createdAt: at, updatedAt: at }] };
const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
await pg.setViewport({ width: 390, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; });
await pg.goto(url, { waitUntil: 'networkidle0' });
await pg.evaluate((d) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el'); localStorage.setItem('spitothiki:v1', JSON.stringify(d)); }, demo);
await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
const go = async (view) => { await pg.evaluate((v) => { const b = document.createElement('button'); b.dataset.view = v; b.hidden = true; document.body.append(b); b.click(); b.remove(); }, view); await wait(600); };
const click = (s) => pg.evaluate((s) => document.querySelector(s).click(), s);
const shot = async (n) => { if (shots) await pg.screenshot({ path: `${shots}/v168-${n}.png` }); };
const totals = () => pg.$$eval('#month-totals-card .bar-row', (rows) => Object.fromEntries(rows.map((r) => [r.querySelector('.bar-label').textContent.split(' · ')[0].trim(), r.querySelector('.bar-value').textContent.trim()])));
const grand = () => pg.$eval('#month-grand-total', (e) => e.textContent.trim());

await go('insights');
const before = { rows: await totals(), grand: await grand() };
check('before: Αγορές 16,50 and Μικροέξοδα 4,00', /16,50/.test(before.rows['🛒 Αγορές']) && /4,00/.test(before.rows['☕ Μικροέξοδα']), before);
check('main screen and insights show no category row yet', !Object.keys(before.rows).some((k) => k.includes('Ρούχα')));

// Receipt → ✎ Διόρθωση → line «Μπλουζάκι» → ＋ Νέα κατηγορία…
await go('receipts'); await click('[data-action="receipt-open"][data-id="r-demo"]'); await wait(400); await click('#receipt-edit'); await wait(400);
check('edit form has a receipt-level category list', Boolean(await pg.$('#re-expcat')));
await pg.evaluate(() => { const s = document.querySelectorAll('.receipt-edit-line select.expcat-select')[1]; s.hidden = false; s.value = '__new'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
check('inline «Νέα κατηγορία» opens', await pg.$eval('.expcat-new', (e) => !e.hidden));
await pg.type('#expcat-new-emoji', '👕'); await pg.type('#expcat-new-name', 'Ρούχα'); await pg.keyboard.press('Enter'); await wait(300);
const lineVal = await pg.evaluate(() => { const s = document.querySelectorAll('.receipt-edit-line select.expcat-select')[1]; return s.options[s.selectedIndex].textContent; });
check('new category created and selected on the line, form still open', lineVal === '👕 Ρούχα' && Boolean(await pg.$('#receipt-edit-form')), lineVal);
await shot('edit');
await click('#receipt-edit-save'); await wait(500);
check('receipt details show the line category', /Μπλουζάκι.*👕 Ρούχα/.test(await pg.$eval('#receipt-items', (e) => e.textContent)));
await pg.evaluate(() => document.querySelector('#receipt-detail-dialog').close());

await go('insights');
let after = { rows: await totals(), grand: await grand() };
check('Σύνολο εξόδων: own row 👕 Ρούχα 15,00, Αγορές 1,50, grand total unchanged', /15,00/.test(after.rows['👕 Ρούχα'] || '') && /1,50/.test(after.rows['🛒 Αγορές']) && after.grand === before.grand, after);
await shot('totals');

// Small expense → ✎ → «👕 Ρούχα»
await go('extras'); await click('#extras-history-open'); await wait(400); await click('[data-action="extras-edit"][data-id="xe-1"]'); await wait(500);
const opt = await pg.$$eval('#extras-expcat option', (o) => o.map((x) => x.textContent));
check('small-expense edit lists the shared category', opt.includes('👕 Ρούχα'), opt);
await pg.select('#extras-expcat', (await pg.$$eval('#extras-expcat option', (o) => o.find((x) => x.textContent === '👕 Ρούχα').value)));
await click('#extras-save'); await wait(500);
await go('insights');
after = { rows: await totals(), grand: await grand() };
check('small expense moved: Ρούχα 19,00, Μικροέξοδα row gone or 0, grand unchanged', /19,00/.test(after.rows['👕 Ρούχα'] || '') && !/4,00/.test(after.rows['☕ Μικροέξοδα'] || '') && after.grand === before.grand, after);

// Manage panel: delete → fallback
await pg.evaluate(() => { document.querySelector('#expense-cats').open = true; });
check('manage panel lists the category with its month total', /👕 Ρούχα.*19,00/.test(await pg.$eval('#expcat-list', (e) => e.textContent)));
await shot('manage');
await click('[data-action="expcat-delete"]'); await wait(500);
after = { rows: await totals(), grand: await grand() };
check('after delete: back to Αγορές 16,50 / Μικροέξοδα 4,00, same grand total', /16,50/.test(after.rows['🛒 Αγορές']) && /4,00/.test(after.rows['☕ Μικροέξοδα']) && !after.rows['👕 Ρούχα'] && after.grand === before.grand, after);

// Add from the panel, English labels, dark mode contrast
await pg.evaluate(() => { document.querySelector('#expense-cats').open = true; });
await pg.type('#expcat-name', 'Δώρα'); await click('#expcat-add'); await wait(400);
check('add from the panel', /Δώρα/.test(await pg.$eval('#expcat-list', (e) => e.textContent)));
await pg.evaluate(() => { localStorage.setItem('spitothiki:lang', 'en'); localStorage.setItem('spitothiki:theme', 'dark'); }); await pg.reload({ waitUntil: 'networkidle0' }); await wait(700);
await go('insights'); await pg.evaluate(() => { document.querySelector('#expense-cats').open = true; });
check('English title', /My expense categories/.test(await pg.$eval('#expense-cats summary', (e) => e.textContent)));
const contrast = await pg.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bg = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; el = el.parentElement; } return 'rgb(255,255,255)'; };
  return [...document.querySelectorAll('#expense-cats summary h2, #expense-cats .field-hint, #expcat-list .product-name, #expcat-list strong')].map((el) => { const a = lum(getComputedStyle(el).color), b = lum(bg(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
});
check('dark mode: new texts ≥ 4.5:1', contrast.length > 0 && contrast.every((r) => r >= 4.5), contrast.map((r) => r.toFixed(2)));
await shot('dark');
check('no page errors', !errors.length, errors);
console.log(failed ? `FAILED ${failed}` : 'PASS'); await browser.close(); if (failed) process.exitCode = 1;
