// v1.5.2: rent/common charges as their own row in «Σύνολο εξόδων μήνα»; rent bills default to «Κάθε μήνα». Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
await pg.goto(url, { waitUntil: 'networkidle0' });
const now = new Date(); const m = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const cur = m(now); const prev = m(new Date(now.getFullYear(), now.getMonth() - 1, 1));
await pg.evaluate((cur, prev) => {
  localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1');
  const b = (id, name, type, amount, due, paid) => ({ id, name, type, amount, due, period: 1, remind: 3, paid, paidAt: paid ? due : '' });
  localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [
    b('r1', 'Ενοίκιο', 'rent', 450, `${cur}-01`, true), b('r0', 'Ενοίκιο', 'rent', 450, `${prev}-01`, true),
    b('k1', 'Κοινόχρηστα', 'rent', 35, `${cur}-10`, false), b('e1', 'ΔΕΗ', 'electricity', 78.4, `${cur}-15`, false), b('e0', 'ΔΕΗ', 'electricity', 92.1, `${prev}-15`, true)] }));
}, cur, prev);
await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
await pg.evaluate(() => { location.hash = '#insights'; }); await wait(900);
const text = await pg.$eval('#month-totals-card', (e) => e.innerText).catch(() => '');
check('rent row shown separately', /Ενοίκιο \/ κοινόχρηστα/.test(text) && /485,00/.test(text), { text });
check('bills row keeps the rest', /Λογαριασμοί/.test(text) && /78,40/.test(text), { text });
check('grand total includes both', /563,40/.test(text), { text });
await pg.evaluate(() => document.querySelector('#month-totals-card').scrollIntoView({ block: 'start' })); await wait(400);
if (shots) await pg.screenshot({ path: `${shots}/v152-month-totals.png` });
await browser.close(); process.exit(failed ? 1 : 0);
