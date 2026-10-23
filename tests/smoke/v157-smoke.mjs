// v1.5.7: yellow box only for toll/fuel receipts of the last 14 days (never supermarkets); row fits narrow phones. Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
const now = new Date().toISOString(), d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const rc = (id, store, days, total) => ({ id, date: d(days), total, store, lines: 5, items: [{ name: 'ΓΑΛΑ', price: 1.2 }], importedAt: now });
const groceries = [1, 3, 8, 20, 30, 39].map((n, i) => rc(`sk${i}`, 'ΕΛΛΗΝΙΚΕΣ ΥΠΕΡΑΓΟΡΕΣ ΣΚΛΑΒΕΝΙΤΗΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ', n, 23.4 + i));
for (const width of [412, 360]) {
  const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  const seed = async (receipts) => { await pg.evaluate((receipts) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [], receipts })); }, receipts); await pg.reload({ waitUntil: 'networkidle0' }); await wait(700); await pg.evaluate(() => { location.hash = '#transport'; }); await wait(800); };
  await seed(groceries);
  check(`${width}px: only supermarkets → no yellow box`, !(await pg.$('#transport-misfiled')));
  await seed([...groceries, rc('t-old', 'ΝΕΑ ΟΔΟΣ Α.Ε.', 20, 2.2), rc('t-new', 'ΑΤΤΙΚΗ ΟΔΟΣ ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΡΟΥΠΑΚΙ ΜΕ ΠΟΛΥ ΜΑΚΡΥ ΟΝΟΜΑ', 2, 2.55)]);
  const ids = await pg.$$eval('#transport-misfiled [data-id]', (b) => b.map((x) => x.dataset.id));
  check(`${width}px: box lists only the recent toll receipt`, ids.join() === 't-new', ids);
  const fit = await pg.evaluate(() => { const box = document.querySelector('#transport-misfiled').getBoundingClientRect(); return [...document.querySelectorAll('#transport-misfiled li > *')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1 && r.right <= innerWidth; }) && document.documentElement.scrollWidth <= innerWidth; });
  check(`${width}px: name, amount and button stay inside the box`, fit);
  if (shots) await pg.screenshot({ path: `${shots}/v157-box-${width}.png` });
  await pg.close();
}
await browser.close(); process.exit(failed ? 1 : 0);
