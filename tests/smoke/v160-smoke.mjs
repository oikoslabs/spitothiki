// v1.6.0: «🧹 Δουλειές σπιτιού» — menu entry (not on home), list/status/summary, ✓ + undo, form, history, delete, backup. Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
const key = (n) => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ch = (id, name, emoji, every, lastAgo, by = '') => ({ id, name, emoji, every, remind: true, assignee: '', start: key(-40), history: [{ date: key(-lastAgo - every), by: by ? 'Γιάννης' : '', at: '1' }, { date: key(-lastAgo), by, at: '2' }], createdAt: 'x', updatedAt: 'x' });
const chores = [ch('c1', 'Σκούπισμα', '🧹', 3, 4, 'Μαρία'), ch('c2', 'Πότισμα φυτών', '🌿', 2, 3), ch('c3', 'Σφουγγάρισμα', '🪣', 7, 7, 'Γιάννης'), ch('c4', 'Ξεσκόνισμα', '🪶', 7, 2, 'Μαρία'), ch('c5', 'Αλλαγή σεντονιών', '🛏️', 14, 5), ch('c6', 'Καθαρισμός ψυγείου', '🧊', 30, 13, 'Γιάννης')];
for (const width of [412, 360]) {
  const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
  const shot = async (n) => { if (shots) await pg.screenshot({ path: `${shots}/v160-${width}-${n}.png` }); };
  await pg.setViewport({ width, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate((chores) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [], chores })); }, chores);
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
  check(`${width}: not on the home screen`, await pg.evaluate(() => !document.querySelector('#view-content').textContent.includes('Δουλειές σπιτιού')));
  await pg.click('[data-action="open-menu"]'); await wait(400);
  await pg.evaluate(() => document.querySelector('.menu-item[data-view="chores"]').scrollIntoView({ block: 'center' })); await wait(200); await shot('0-menu');
  await pg.evaluate(() => document.querySelector('.menu-item[data-view="chores"]').click()); await wait(700);
  const sum = await pg.$eval('#chores-summary', (e) => e.textContent);
  const order = await pg.$$eval('#chores-list .chore-card', (cs) => cs.map((c) => [c.dataset.chore, [...c.classList].find((x) => /chore-(late|today|ok)/.test(x))]));
  check(`${width}: summary «2 καθυστερούν · 1 σήμερα · 3 εντάξει»`, /2 καθυστερούν/.test(sum) && /1 σήμερα/.test(sum) && /3 εντάξει/.test(sum), sum);
  check(`${width}: red first, then orange, then green`, order[0][1] === 'chore-late' && order[2][0] === 'c3' && order[2][1] === 'chore-today' && order[5][1] === 'chore-ok', order);
  const fit = await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(`${width}: nothing sticks out sideways`, fit);
  await shot('1-list');
  await pg.evaluate(() => document.querySelector('[data-chore="c3"] [data-action="chore-done"]').click()); await wait(500);
  const st = await pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).chores.find((c) => c.id === 'c3'));
  check(`${width}: ✓ Έγινε adds today to history and turns it green`, st.history.length === 3 && await pg.$eval('[data-chore="c3"]', (e) => e.classList.contains('chore-ok')));
  await pg.click('#chores-undo [data-action="chore-undo"]'); await wait(500);
  check(`${width}: undo removes the accidental ✓`, await pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).chores.find((c) => c.id === 'c3').history.length === 2));
  // new chore
  await pg.evaluate(() => { document.querySelector('#chore-new').scrollIntoView({ block: 'center' }); document.querySelector('#chore-new').click(); }); await wait(500);
  await pg.evaluate(() => document.querySelector('[data-action="chore-suggest"][data-name="Μπάνιο"]').click());
  await pg.evaluate(() => document.querySelector('[data-action="chore-step"][data-delta="1"]').click());
  await pg.evaluate(() => document.querySelector('[data-action="chore-assignee"][data-name="Μαρία"]')?.click());
  await shot('2-form');
  check(`${width}: form fills name/days/assignee`, await pg.evaluate(() => { const f = document.querySelector('#chore-form').elements; return f.name.value === 'Μπάνιο' && f.every.value === '8' && f.assignee.value === 'Μαρία'; }));
  await pg.evaluate(() => document.querySelector('#chore-save').click()); await wait(600);
  const nw = await pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).chores.find((c) => c.name === 'Μπάνιο'));
  check(`${width}: new chore saved (orange: due today)`, nw && nw.every === 8 && nw.assignee === 'Μαρία' && await pg.$eval(`[data-chore="${nw.id}"]`, (e) => e.classList.contains('chore-today')));
  // history
  await pg.evaluate(() => document.querySelector('[data-chore="c1"] [data-action="chore-history"]').click()); await wait(500);
  const counts = await pg.$eval('#chore-counts', (e) => e.textContent);
  check(`${width}: history counts per member`, /2 φορές/.test(counts) && /Μαρία 1/.test(counts) && /Γιάννης 1/.test(counts), counts);
  await shot('3-history');
  // delete via edit
  await pg.evaluate(() => document.querySelector('[data-action="chore-edit"]').click()); await wait(400);
  await pg.evaluate(() => document.querySelector('[data-action="chore-delete"]').click()); await wait(500);
  check(`${width}: delete chore`, await pg.evaluate(() => !JSON.parse(localStorage.getItem('spitothiki:v1')).chores.some((c) => c.id === 'c1')));
  await pg.close();
}
await browser.close(); process.exit(failed ? 1 : 0);
