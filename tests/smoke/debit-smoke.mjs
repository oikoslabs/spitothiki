// Direct debit: set in the form, badge + «Θα χρεωθεί στις», not in «Προς πληρωμή», no alert, auto-paid when due,
// remembered for the next bill of the same provider. Usage: node tests/smoke/debit-smoke.mjs <url> [width] [lang] [shotsDir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 390); const lang = process.argv[4] || 'el'; const shots = process.argv[5];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage(); await page.setBypassServiceWorker(true);
await page.setViewport({ width, height: 900, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
await page.evaluateOnNewDocument((l) => { Object.defineProperty(navigator, 'language', { get: () => (l === 'en' ? 'en-US' : 'el-GR') }); }, lang);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('sv-SE'); };
await page.goto(`${url}#bills`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); }); await page.reload({ waitUntil: 'networkidle0' });
let failed = 0; const check = async (n, fn) => { let ok = false; try { ok = await fn(); } catch (e) { console.log(e.message); } console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); failed += !ok; };
const addBill = async (name, amount, due, autoPay) => {
  await page.click('[data-action="add-bill"]'); await wait();
  await page.type('#bill-name', name); await page.$eval('#bill-amount', (e, v) => { e.value = v; }, amount);
  await page.$eval('#bill-due', (e, v) => { e.value = v; }, due);
  await page.select('#bill-period', '1');
  const remembered = await page.$eval('#bill-autopay', (e) => e.checked);
  if (autoPay != null && remembered !== autoPay) await page.click('#bill-autopay');
  await page.click('#bill-save'); await wait();
  return remembered;
};
await addBill('ΔΕΗ', '50', day(2), true);
await addBill('ΕΥΔΑΠ', '30', day(1), false);
if (shots) await page.screenshot({ path: `${shots}/v11-after-bills-debit-phone.png`, fullPage: true });
await check('direct-debit bill: badge, «will be debited», not in «to pay», no alert for it', async () => page.evaluate(() => {
  const unpaid = document.querySelector('#bills-unpaid').textContent; const debits = document.querySelector('#bills-debits')?.textContent || '';
  const alert = document.querySelector('#bills-alert')?.textContent || '';
  return !/ΔΕΗ/.test(unpaid) && /ΔΕΗ/.test(debits) && /(Πάγια εντολή|Direct debit)/.test(debits) && /(Θα χρεωθεί|Will be debited)/.test(debits) && /ΕΥΔΑΠ/.test(unpaid) && /(^|\D)30/.test(alert) && !/80/.test(alert);
}));
await check('next ΔΕΗ bill: «πάγια εντολή» pre-ticked (remembered per provider)', async () => {
  await page.click('[data-action="add-bill"]'); await wait(); await page.type('#bill-name', 'ΔΕΗ'); await wait(200);
  const on = await page.$eval('#bill-autopay', (e) => e.checked);
  await page.evaluate(() => document.querySelector('#bill-dialog').close());
  return on;
});
await check('due date reached → auto-marked paid, next month created, counted once in totals', async () => {
  await page.evaluate((past) => { const st = JSON.parse(localStorage.getItem('spitothiki:v1')); st.bills.find((b) => b.name === 'ΔΕΗ').due = past; localStorage.setItem('spitothiki:v1', JSON.stringify(st)); }, day(-1));
  await page.reload({ waitUntil: 'networkidle0' }); await wait(800);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).bills.filter((b) => b.name === 'ΔΕΗ'));
  return st.length === 2 && st.filter((b) => b.paid).length === 1 && st.find((b) => b.paid).paidAt === st.find((b) => b.paid).due && st.find((b) => !b.paid).autoPay === true;
});
await browser.close();
if (errors.length) { console.log(errors); failed++; }
console.log(failed ? `debit smoke ${width} ${lang}: FAILED` : `debit smoke ${width} ${lang}: all ok`);
process.exit(failed ? 1 : 0);
