// v1.6.11–13: late chores notify once a day when the app opens (and again the next day); unpaid bills are not in the
// month/year totals but shown apart («δεν μετράνε ακόμη»); a paid one counts on its payment day. Demo data only.
// Usage: node tests/smoke/v1611-smoke.mjs <url>
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i)); } };
const errors = [];
const act = (pg, action, extra = {}) => pg.evaluate((a, x) => { const b = document.createElement('button'); b.dataset.action = a; Object.assign(b.dataset, x); b.hidden = true; document.body.append(b); b.click(); b.remove(); }, action, extra);
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const today = key(now); const ago2 = key(new Date(now - 2 * 864e5)); const in5 = key(new Date(+now + 5 * 864e5));
const month = today.slice(0, 7); const prevMonthDay = key(new Date(now.getFullYear(), now.getMonth() - 1, 10));
const seed = { items: [], shopping: [],
  chores: [{ id: 'c1', name: 'Κάλεσε υδραυλικό', emoji: '🔧', every: 30, remind: true, assignee: '', history: [], start: ago2, createdAt: 'x', updatedAt: 'x' },
    { id: 'c2', name: 'Κάλεσε ηλεκτρολόγο', emoji: '💡', every: 30, remind: true, assignee: '', history: [], start: ago2, createdAt: 'x', updatedAt: 'x' }],
  bills: [{ id: 'b1', name: 'ΔΕΗ demo', type: 'electricity', amount: 70, due: in5.startsWith(month) ? in5 : today, paid: false, remind: 3, updatedAt: 'x' },
    { id: 'b2', name: 'Νερό demo', type: 'water', amount: 20, due: today, paid: true, paidAt: today, remind: 3, updatedAt: 'x' },
    // v1.6.13: two «Τηλέφωνο» bills ticked the same day = bulk entry: the newest counts today, the older one in its due month
    { id: 'b3', name: 'Τηλέφωνο demo', type: 'phone', amount: 300, due: prevMonthDay, paid: true, paidAt: today, remind: 3, updatedAt: 'x' },
    { id: 'b4', name: 'Τηλέφωνο demo', type: 'phone', amount: 10, due: today, paid: true, paidAt: today, remind: 3, updatedAt: 'x' }] };
const ctx = await browser.createBrowserContext(); await ctx.overridePermissions(new URL(url).origin, ['notifications']);
const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
await pg.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
pg.on('pageerror', (e) => errors.push(e.message));
await pg.evaluateOnNewDocument(() => { window.__spitoProtect = true; window.__notes = [];
  const N = function (title, o) { __notes.push({ title, tag: o?.tag }); }; N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N;
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => null; });
await pg.goto(url, { waitUntil: 'networkidle0' });
await pg.evaluate(async (s) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el');
  localStorage.setItem('spitothiki:notifications', JSON.stringify({ enabled: true, days: 3 })); localStorage.setItem('spitothiki:v1', JSON.stringify(s)); await caches.delete('spitothiki-data'); }, seed);
await pg.reload({ waitUntil: 'networkidle0' }); await wait(1200);
let notes = await pg.evaluate(() => __notes.filter((n) => n.tag === 'spitothiki-chores'));
check('late chores → one combined notification when the app opens', notes.length === 1 && /υδραυλικό/.test(notes[0].title) && /ηλεκτρολόγο/.test(notes[0].title), notes);
await pg.reload({ waitUntil: 'networkidle0' }); await wait(1200);
notes = await pg.evaluate(() => __notes.filter((n) => n.tag === 'spitothiki-chores'));
check('reopening the same day: no second chores notification', notes.length === 0, notes);
await pg.evaluate(async () => { const c = await caches.open('spitothiki-data'); await c.put('./__chores-notified', new Response('2000-01-01')); });
await pg.reload({ waitUntil: 'networkidle0' }); await wait(1200);
notes = await pg.evaluate(() => __notes.filter((n) => n.tag === 'spitothiki-chores'));
check('next day (still undone): it reminds again', notes.length === 1, notes);
// Totals: only the paid 20 € counts; the unpaid 70 € is listed apart.
await pg.evaluate(() => { location.hash = '#insights'; }); await wait(700);
const ins = await pg.evaluate(() => ({ total: document.querySelector('#month-grand-total')?.textContent, pending: document.querySelector('#month-pending-bills')?.textContent, year: document.querySelector('#bills-year-total')?.textContent, ypend: document.querySelector('#bills-year-pending')?.textContent, trend: document.querySelector('#month-trend')?.textContent }));
check('month total: paid 20 + newest of the bulk 10 = 30 € (unpaid 70 and the old 300 out)', /^30[,.]00/.test(ins.total.replace(/\s/g, '')), ins);
check('unpaid bill shown apart: «1 απλήρωτος … δεν μετράει ακόμη»', /1 απλήρωτος λογαριασμός/.test(ins.pending || '') && /70/.test(ins.pending) && /δεν μετράει/.test(ins.pending), ins);
check('bills year card: 330 € (300 last month + 30 this month), unpaid apart', /^330[,.]00/.test(ins.year.replace(/\s/g, '')) && /70/.test(ins.ypend || ''), ins);
check('trend: ▼ 270 € vs last month (the old 300 € bill, ticked today, stays there)', /270/.test(ins.trend || ''), ins);
const brk = await pg.evaluate(() => { const d = document.querySelector('#bills-month-list'); if (!d) return null; d.open = true; return { sum: d.querySelector('summary').textContent, rows: [...d.querySelectorAll('li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) }; });
check('breakdown «Ποιοι μετράνε»: 20 € + 10 €, each says what it counts by', brk && brk.rows.length === 2 && /Νερό demo/.test(brk.rows.join()) && brk.rows.every((r) => /μετράει στην πληρωμή/.test(r)), brk);
// ✎ the old 300 € bill: payment-date field + «Παλιός λογαριασμός» ticked; untick → it moves to this month.
await act(pg, 'bill-edit', { id: 'b3' }); await wait(400);
const ed = await pg.evaluate(() => ({ shown: !document.querySelector('#bill-paid-fields').hidden, paidAt: document.querySelector('#bill-paid-at').value, old: document.querySelector('#bill-count-due').checked }));
check('✎ on a paid bill: «Πληρώθηκε στις» shown, «Παλιός λογαριασμός» ticked', ed.shown && ed.paidAt === today && ed.old, ed);
await pg.evaluate(() => { document.querySelector('#bill-count-due').checked = false; document.querySelector('#bill-save').click(); }); await wait(700);
check('after unticking: this month = 330 €', /^330[,.]00/.test((await pg.$eval('#month-grand-total', (e) => e.textContent)).replace(/\s/g, '')));
await act(pg, 'bill-edit', { id: 'b2' }); await wait(300);
await pg.evaluate((d) => { document.querySelector('#bill-paid-at').value = d; document.querySelector('#bill-save').click(); }, prevMonthDay); await wait(700);
check('changing «Πληρώθηκε στις» to last month moves the 20 € there (310 €)', /^310[,.]00/.test((await pg.$eval('#month-grand-total', (e) => e.textContent)).replace(/\s/g, '')));
await act(pg, 'add-bill'); await wait(300);
check('new bill: no paid fields', await pg.$eval('#bill-paid-fields', (e) => e.hidden));
await pg.evaluate(() => document.querySelector('#bill-dialog').close());
await pg.evaluate(() => { location.hash = '#overview'; }); await wait(600);
const home = await pg.evaluate(() => ({ total: document.querySelector('#home-month-total')?.textContent, pend: Boolean(document.querySelector('#home-month .pending-bills')) }));
check('home: month total 310 €, no extra line on the main screen', /^310[,.]00/.test(home.total.replace(/\s/g, '')) && !home.pend, home);
check('version 1.6.13 shown', await pg.evaluate(() => /1\.6\.13/.test(document.querySelector('#app-version').textContent)));
check('no page errors', !errors.length, errors);
await browser.close(); console.log(failed ? `${failed} FAILED` : 'all ok'); process.exit(failed ? 1 : 0);
