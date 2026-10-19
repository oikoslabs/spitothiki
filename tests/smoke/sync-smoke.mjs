// Sync smoke test: two browser "devices" with a fake Firebase (see fake-firebase.mjs).
// Usage: npm i --no-save puppeteer-core && node tests/smoke/sync-smoke.mjs <url>
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
    if (u.includes('gstatic.com/firebasejs/') && u.endsWith('firebase-app.js')) return js(fakeApp);
    if (u.includes('gstatic.com/firebasejs/') && u.endsWith('firebase-auth.js')) return js(fakeAuth);
    if (u.includes('gstatic.com/firebasejs/') && u.endsWith('firebase-firestore.js')) return js(fakeFirestore);
    return request.continue();
  });
  await page.goto(`${url}#settings`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
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

const phone = await device('phone');
const laptop = await device('laptop');

await check('sync card asks to sign in when configured', async () => (await phone.$('#sync-email-form')) !== null);
await addItem(phone, 'Γάλα');
await addItem(laptop, 'Ρύζι');
await check('sign up uploads local data', async () => {
  await signUp(phone, 'giannis@example.com');
  const status = await phone.$eval('#sync-status', (el) => el.textContent);
  const records = [...backend.docs.keys()].filter((k) => k.startsWith('households/uid-giannisexamplecom/records/'));
  return /Συγχρονισμένο|Synced/.test(status) && records.length === 1;
});
let invite = '';
await check('invite code is created', async () => {
  await phone.click('[data-action="sync-invite"]'); await wait(600);
  const message = await phone.$eval('#confirm-message', (el) => el.textContent);
  invite = (message.match(/uid-[a-z0-9]+\.[a-z0-9]+/) || [''])[0];
  await phone.click('#confirm-dialog button[value=cancel]'); await wait();
  return Boolean(invite);
});
await check('second device joins the household and both lists merge', async () => {
  await signUp(laptop, 'maria@example.com');
  await laptop.type('#sync-join-form input[name=invite]', 'uid-giannisexamplecom.wrongcode');
  await laptop.click('#sync-join-form button[type=submit]'); await wait(600);
  const rejected = (await items(phone)).length === 1;
  await laptop.$eval('#sync-join-form input[name=invite]', (el) => { el.value = ''; });
  await laptop.type('#sync-join-form input[name=invite]', invite);
  await laptop.click('#sync-join-form button[type=submit]'); await wait(1500);
  const a = await items(phone), b = await items(laptop);
  return rejected && JSON.stringify(a) === JSON.stringify(['Γάλα:1', 'Ρύζι:1']) && JSON.stringify(a) === JSON.stringify(b);
}).catch(() => {});
await check('changes and deletions propagate', async () => {
  await laptop.evaluate(() => { location.hash = '#pantry'; }); await wait();
  const cards = await laptop.$$eval('.inventory-card', (els) => els.map((el) => el.querySelector('.product-name').textContent));
  await laptop.click(`.inventory-card:nth-child(${cards.indexOf('Γάλα') + 1}) [data-action="adjust-quantity"][data-delta="1"]`); await wait(900);
  const bumped = (await items(phone)).includes('Γάλα:2');
  await phone.evaluate(() => { location.hash = '#pantry'; }); await wait();
  const names = await phone.$$eval('.inventory-card', (els) => els.map((el) => el.querySelector('.product-name').textContent));
  await phone.click(`.inventory-card:nth-child(${names.indexOf('Ρύζι') + 1}) [data-action="delete-item"]`); await wait();
  await wait(900);
  const deleted = JSON.stringify(await items(laptop)) === JSON.stringify(['Γάλα:2']);
  // «Αναίρεση» brings it back on the other device too
  await phone.click('#toast [data-action="toast-undo"]'); await wait(900);
  const restored = (await items(laptop)).includes('Ρύζι:1') || (await items(laptop)).some((x) => x.startsWith('Ρύζι'));
  await phone.evaluate(() => { location.hash = '#pantry'; }); await wait();
  const again = await phone.$$eval('.inventory-card', (els) => els.map((el) => el.querySelector('.product-name').textContent));
  await phone.click(`.inventory-card:nth-child(${again.indexOf('Ρύζι') + 1}) [data-action="delete-item"]`); await wait(900);
  return bumped && deleted && restored && JSON.stringify(await items(laptop)) === JSON.stringify(['Γάλα:2']);
});
await check('stores created in ⚙ and at cart start persist after reload and reach the other device', async () => {
  await phone.setViewport({ width: 375, height: 800, isMobile: true, hasTouch: true });
  await phone.evaluate(() => { location.hash = '#shopping'; }); await wait();
  await phone.click('[data-action="toggle-stores"]'); await wait();
  await phone.type('#store-form input[name=name]', 'Σκλαβενίτης'); await phone.click('#store-form button[type=submit]'); await wait(900);
  await phone.click('#open-cart'); await wait();
  await phone.select('#cart-store', '__new'); await wait();
  await phone.type('#cart-new-store', 'Μασούτης'); await phone.click('#cart-start-form button[type=submit]'); await wait(900);
  await phone.reload({ waitUntil: 'networkidle0' }); await wait(1500);
  const names = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem('spitothiki:v1')).stores || []).map((s) => s.name).sort().join(','));
  const local = await names(phone), other = await names(laptop);
  const trip = await phone.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).trips.find((t) => t.status === 'active'));
  const stillSignedIn = /Συγχρονισμένο|Synced/.test(await phone.evaluate(() => { location.hash = '#settings'; return new Promise((r) => setTimeout(() => r(document.querySelector('#sync-status')?.textContent || ''), 600)); }));
  if (local !== 'Μασούτης,Σκλαβενίτης' || other !== local) console.log('  stores:', { local, other, trip: trip?.storeName, stillSignedIn });
  return local === 'Μασούτης,Σκλαβενίτης' && other === local && trip?.storeName === 'Μασούτης' && Boolean(trip.storeId) && stillSignedIn;
});
await check('sign out keeps local data', async () => {
  await phone.evaluate(() => { location.hash = '#settings'; }); await wait();
  await phone.click('[data-action="sync-signout"]'); await wait(500);
  return (await phone.$('#sync-email-form')) !== null && (await items(phone)).length === 1;
});

console.log(`sync: ${errors.length ? 'FAILED' : 'passed'}`, errors.length ? JSON.stringify(errors) : '');
await browser.close();
process.exit(errors.length ? 1 : 0);
