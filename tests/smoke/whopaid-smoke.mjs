// «Ποιος πλήρωσε τι» smoke: a demo 2-member household (two browser devices, fake Firebase).
// Usage: npm i --no-save puppeteer-core && node tests/smoke/whopaid-smoke.mjs <url>
import puppeteer from 'puppeteer-core';
import { createFakeBackend, fakeApp, fakeAuth, fakeFirestore } from './fake-firebase.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const backend = createFakeBackend();
const errors = [];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const CONFIG = `export const firebaseConfig = { apiKey: 'test', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'test' };\nexport const authProviders = ['google', 'password'];`;

async function device(name) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1100, height: 900 });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && m.text().trim() && !/404|cloudflareinsights|net::ERR_FAILED|CORS/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await page.exposeFunction('__fb', (op, k, data, extra) => backend.handle(op, k, data, extra));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const u = request.url();
    const js = (body) => request.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
    if (u.endsWith('/src/firebase-config.js')) return js(CONFIG);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-app.js')) return js(fakeApp);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-auth.js')) return js(fakeAuth);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-firestore.js')) return js(fakeFirestore);
    return request.continue();
  });
  await page.goto(`${url}#settings`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:lang', 'el'); });
  await page.reload({ waitUntil: 'networkidle0' });
  return page;
}

const results = [];
async function check(name, fn) {
  try { const ok = await fn(); results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(`assert: ${name}`); }
  catch (error) { console.log(`FAIL ${name}: ${error.message}`); errors.push(`assert: ${name}: ${error.message}`); }
}
const items = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1') || '{"items":[]}').items.map((i) => `${i.name}:${i.quantity}`).sort());
async function addItem(page, name) {
  await page.evaluate((n) => { location.hash = '#pantry'; }, name); await wait();
  await page.click('.page-heading [data-action="add-item"]'); await wait();
  await page.type('#item-name', name);
  await page.click('#item-form button[type=submit]'); await wait();
}
async function signUp(page, email) {
  await page.evaluate(() => { location.hash = '#settings'; }); await wait();
  await page.type('#sync-email-form input[name=email]', email);
  await page.type('#sync-email-form input[name=password]', 'secret123');
  await page.click('#sync-email-form button[value=signup]'); await wait(900);
}


const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
async function addData(page, fn, arg) {
  await page.evaluate((code, a) => { const s = JSON.parse(localStorage.getItem('spitothiki:v1') || '{"items":[],"shopping":[]}'); (0, eval)(code)(s, a); localStorage.setItem('spitothiki:v1', JSON.stringify(s)); }, `(${fn})`, arg);
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1500);
}
async function insights(page) { await page.evaluate(() => { location.hash = '#settings'; }); await wait(200); await page.evaluate(() => { location.hash = '#insights'; }); await wait(700); }
const card = (page) => page.$eval('#whopaid-card', (el) => el.textContent.replace(/\s+/g, ' ')).catch(() => null);
const total = (page) => page.$eval('#month-grand-total', (el) => el.textContent).catch(() => null);

const phone = await device('giannis');
const laptop = await device('maria');
await check('signed out: no «Ποιος πλήρωσε τι» card', async () => { await insights(phone); return (await card(phone)) === null; });
await signUp(phone, 'giannis@example.com');
const d = today();
await addData(phone, (s, day) => {
  s.transport = [...(s.transport || []), { id: 'tr-demo', type: 'tolls', amount: 50, date: day, createdAt: day, updatedAt: day }];
}, d);
let totalBefore = '';
await check('single-member household: card hidden (one-line hint only), «Μέλη: 1» in Ρυθμίσεις, totals unchanged', async () => { await insights(phone); totalBefore = await total(phone); const hint = await phone.$eval('#whopaid-hint', (el) => el.textContent).catch(() => '');
  await phone.evaluate(() => { location.hash = '#settings'; }); await wait(500);
  const count = await phone.$eval('#sync-members', (el) => el.textContent).catch(() => '');
  return (await card(phone)) === null && /50/.test(totalBefore) && /2 μέλη/.test(hint) && /: 1$/.test(count.trim()); });
let invite = '';
await phone.evaluate(() => { location.hash = '#settings'; }); await wait();
await phone.click('[data-action="sync-invite"]'); await wait(600);
invite = ((await phone.$eval('#confirm-message', (el) => el.textContent)).match(/uid-[a-z0-9]+\.[a-z0-9]+/) || [''])[0];
await phone.click('#confirm-dialog button[value=cancel]'); await wait();
await signUp(laptop, 'maria@example.com');
await laptop.type('#sync-join-form input[name=invite]', invite);
await laptop.click('#sync-join-form button[type=submit]'); await wait(1800);
await addData(laptop, (s, day) => {
  s.bills = [...(s.bills || []), { id: 'bill-demo', name: 'ΔΕΗ demo', type: 'electricity', amount: 100, due: day, paid: true, paidAt: day, createdAt: day, updatedAt: day }];
}, d);
await wait(1200);
await check('2 members: card shows who paid and «Γιάννης χρωστάει σε Μαρία: 25,00 €»', async () => {
  for (const [p, name] of [[phone, 'Γιάννης'], [laptop, 'Μαρία']]) {
    await insights(p);
    await p.$eval('#whopaid-settings', (el) => { el.open = true; });
    await p.$eval('#whopaid-name', (el) => { el.value = ''; }); await p.type('#whopaid-name', name);
    await p.click('#whopaid-form button[type=submit]'); await wait(1200);
  }
  await insights(phone); await insights(laptop);
  const a = await card(phone), b = await card(laptop);
  if (!/Γιάννης χρωστάει σε Μαρία: 25,00/.test(a || '')) console.log('  card:', a);
  return /Γιάννης χρωστάει σε Μαρία: 25,00/.test(a || '') && /Γιάννης χρωστάει σε Μαρία: 25,00/.test(b || '') && /150,00/.test(await total(phone));
});
await check('changing «Πλήρωσε» moves the balance (bill → Κοινό ταμείο), totals unchanged', async () => {
  await phone.$eval('#whopaid-list', (el) => { el.open = true; });
  await phone.select('select[data-whopaid-key="bill:bill-demo"]', 'shared'); await wait(1500);
  await insights(phone); await insights(laptop);
  const a = await card(phone), b = await card(laptop);
  const ok = /Μαρία χρωστάει σε Γιάννης: 25,00/.test(a) && /Κοινό ταμείο \(δεν μετράει\): 100,00/.test(a) && /Μαρία χρωστάει σε Γιάννης: 25,00/.test(b);
  if (!ok) console.log('  after payer change:', a, '|', b);
  await phone.$eval('#whopaid-list', (el) => { el.open = true; });
  await phone.select('select[data-whopaid-key="bill:bill-demo"]', 'uid-mariaexamplecom'); await wait(1200);
  await insights(phone);
  return ok && /Γιάννης χρωστάει σε Μαρία: 25,00/.test(await card(phone)) && /150,00/.test(await total(phone)) && /150,00/.test(await total(laptop));
});
await check('custom 60/40 split changes what each owes', async () => {
  await laptop.$eval('#whopaid-settings', (el) => { el.open = true; });
  const inputs = await laptop.$$('#whopaid-form [name="share"]');
  const ids = await laptop.$$eval('#whopaid-form [name="share"]', (els) => els.map((e) => e.dataset.member));
  for (const [i, el] of inputs.entries()) { await el.click({ clickCount: 3 }); await el.type(ids[i] === 'uid-giannisexamplecom' ? '60' : '40'); }
  await laptop.click('#whopaid-form button[type=submit]'); await wait(1500);
  await insights(phone);
  const ok = /Γιάννης χρωστάει σε Μαρία: 40,00/.test(await card(phone)); // 60% of 150 = 90, paid 50
  await laptop.click('[data-action="whopaid-equal"]'); await laptop.click('#whopaid-form button[type=submit]'); await wait(1500);
  await insights(phone);
  return ok && /Γιάννης χρωστάει σε Μαρία: 25,00/.test(await card(phone));
});
await check('«Εξοφλήθηκε» resets the balance on both devices; it is not an expense', async () => {
  await insights(phone);
  await phone.click('#whopaid-settle'); await wait(300);
  await phone.click('#confirm-dialog button[value=confirm], #confirm-dialog button[value=ok], #confirm-dialog button[type=submit]'); await wait(1500);
  await insights(phone); await insights(laptop);
  const a = await card(phone), b = await card(laptop);
  if (!/πάτσι/.test(a || '') || !/πάτσι/.test(b || '')) console.log('  settled:', a, '|', b);
  return /πάτσι/.test(a) && /πάτσι/.test(b) && /Εξοφλήθηκε .*Γιάννης → Μαρία 25,00/.test(b) && /150,00/.test(await total(phone)) && /150,00/.test(await total(laptop));
});
await check('undoing the settlement (×) brings the balance back', async () => {
  await phone.click('[data-action="whopaid-unsettle"]'); await wait(300);
  if (await phone.$('#confirm-dialog[open]')) { await phone.click('#confirm-dialog button[value=confirm], #confirm-dialog button[value=ok], #confirm-dialog button[type=submit]'); }
  await wait(1500); await insights(laptop);
  return /Γιάννης χρωστάει σε Μαρία: 25,00/.test(await card(laptop));
});
await check('expense records were never rewritten (no payer fields added)', async () => {
  const docs = [...backend.docs.entries()].filter(([k]) => /records\/(bills|transport)_/.test(k)).map(([, v]) => v.data);
  return docs.length === 2 && docs.every((x) => !('paidBy' in x) && !('who' in x));
});

console.log(`whopaid: ${errors.length ? 'FAILED' : 'passed'}`, errors.length ? JSON.stringify(errors) : '');
await browser.close();
process.exit(errors.length ? 1 : 0);
