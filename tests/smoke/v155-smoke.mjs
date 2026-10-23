// v1.5.5: toll receipts saved by mistake as groceries (before v1.5.4) can be moved to Μετακινήσεις in one tap;
// version shown in the footer. Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
const shot = async (name) => { if (shots) await pg.screenshot({ path: `${shots}/v155-${name}.png` }); };
const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
await pg.goto(url, { waitUntil: 'networkidle0' });
const today = new Date().toISOString().slice(0, 10), now = new Date().toISOString();
await pg.evaluate((today, now) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1');
  localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [], receipts: [{ id: 'photo-demo1', date: today, total: 2.55, store: 'ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ', lines: 0, importedAt: now }], purchases: [{ id: 'pur-photo-demo1', rowId: '', name: 'ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ', category: 'Άλλο', price: 2.55, date: today, receiptId: 'photo-demo1', updatedAt: now }] })); }, today, now);
await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
const ver = await pg.$eval('#app-version', (e) => e.textContent).catch(() => '');
check('version visible in footer', ver.includes('1.5.5'), ver);
if (shots) { await pg.evaluate(() => document.querySelector('#app-version').scrollIntoView({ block: 'center' })); await wait(200); await shot('1-version'); }
// Path to the receipts list: Μενού → Σύνολο εξόδων → Αποδείξεις → tap the receipt
await pg.evaluate(() => window.scrollTo(0, 0)); await pg.click('[data-action="open-menu"]'); await wait(500); await shot('2-menu');
await pg.evaluate(() => [...document.querySelectorAll('.menu-item[data-view="insights"]')][0].click()); await wait(800);
await pg.evaluate(() => document.querySelector('#insights-receipts').scrollIntoView({ block: 'center' })); await wait(200); await shot('3-insights-receipts-button');
await pg.click('#insights-receipts'); await wait(800); await shot('4-receipts-list');
await pg.click('[data-action="receipt-open"]'); await wait(600); await shot('5-receipt-detail');
check('receipt detail offers «Μεταφορά στις Μετακινήσεις»', Boolean(await pg.$('#receipt-move-transport')));
await pg.click('[data-action="receipt-detail-close"]'); await wait(300);
// Μετακινήσεις shows the banner too
await pg.evaluate(() => { location.hash = '#transport'; }); await wait(900);
check('Μετακινήσεις shows the misfiled-receipt banner', Boolean(await pg.$('#transport-misfiled [data-action="receipt-move-transport"]'))); await shot('6-transport-banner');
await pg.click('#transport-misfiled [data-action="receipt-move-transport"]'); await wait(800);
const f = await pg.evaluate(() => { const e = document.querySelector('#transport-form').elements; return { type: e.type.value, amount: e.amount.value }; });
check('form prefilled as Διόδια 2.55', f.type === 'tolls' && Number(f.amount) === 2.55, f); await shot('7-transport-form');
await pg.click('#transport-save'); await wait(900);
const st = await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('spitothiki:v1')); return { tr: (s.transport || []).length, pur: (s.purchases || []).length, fmt: (s.receipts || []).map((r) => r.format), banner: Boolean(document.querySelector('#transport-misfiled')), total: document.querySelector('#transport-total').textContent }; });
check('moved: 1 transport entry, no grocery expense, banner gone', st.tr === 1 && st.pur === 0 && st.fmt.join() === 'transport' && !st.banner, st);
await pg.evaluate(() => document.querySelector('#transport-total').scrollIntoView({ block: 'center' })); await wait(200); await shot('8-saved');
await browser.close(); process.exit(failed ? 1 : 0);
