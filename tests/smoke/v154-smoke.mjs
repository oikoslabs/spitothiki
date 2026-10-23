// v1.5.4: a toll receipt the scanner can't fully read, opened from Μετακινήσεις, must end up in Μετακινήσεις
// (before: «Καταγραφή εξόδου» saved it as a grocery expense, so it never showed up). Demo data only.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const icon = fileURLToPath(new URL('../../icons/icon-192.png', import.meta.url));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' });
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }; });
await pg.goto(url, { waitUntil: 'networkidle0' });
await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [] })); });
await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
await pg.evaluate(() => { location.hash = '#transport'; }); await wait(900);
await pg.evaluate(() => { window.__spitoOcrMock = async () => ({ text: 'ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΡΟΥΠΑΚΙ\nΣΥΝΟΛΟ 2,55\n', confidence: 60 }); document.querySelector('[data-action="transport-receipt"]').click(); }); await wait(600);
await (await pg.$('#receipt-photo-file')).uploadFile(icon); await wait(2500);
const btn = await pg.evaluate(() => document.querySelector('#receipt-review-form button[type="submit"]')?.textContent || document.querySelector('#receipt-error')?.textContent);
check('only-total toll receipt offers «Καταχώριση στις Μετακινήσεις»', /Μετακινήσεις/.test(btn || ''), btn);
await pg.evaluate(() => document.querySelector('#receipt-review-form button[type="submit"]')?.click()); await wait(800);
await pg.evaluate(() => { const f = document.querySelector('#transport-form'); f.elements.type.value = 'tolls'; if (!f.elements.amount.value) f.elements.amount.value = '2.55'; }); await wait(200);
await pg.evaluate(() => document.querySelector('#transport-save').click()); await wait(900);
const st = await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('spitothiki:v1')); return { tr: (s.transport || []).map((e) => [e.type, e.amount]), pur: (s.purchases || []).length, total: document.querySelector('#transport-total')?.textContent }; });
check('saved in Μετακινήσεις as Διόδια, not as groceries', st.tr.length === 1 && st.tr[0][0] === 'tolls' && st.pur === 0 && /2[.,]55/.test(st.total), st);
if (shots) { await pg.evaluate(() => document.querySelector('#transport-total')?.scrollIntoView({ block: 'center' })); await wait(300); await pg.screenshot({ path: `${shots}/v154-toll-saved.png` }); }
await browser.close(); process.exit(failed ? 1 : 0);
