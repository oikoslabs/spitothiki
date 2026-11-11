// v1.9.22 smoke: shared-list notices between two fake devices (fake Firebase, see fake-firebase.mjs), quick
// suggestions, «Ξαναψώνισε τα ίδια» and row notes on a signed-out device. Fictional data only.
// Usage: node tests/smoke/shopping-extras-smoke.mjs <url> [--quick]   (--quick skips the 2-minute throttle checks)
import puppeteer from 'puppeteer-core';
import { createFakeBackend, fakeApp, fakeAuth, fakeFirestore } from './fake-firebase.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8080/';
const quick = process.argv.includes('--quick');
const IDLE = /^http:\/\/(127\.0\.0\.1|localhost)/.test(url) ? 'networkidle0' : 'networkidle2';
const only = process.argv.includes('--solo');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const backend = createFakeBackend();
const errors = [];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const CONFIG = `export const firebaseConfig = { apiKey: 'test', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'test' };\nexport const authProviders = ['google', 'password'];`;

async function device(name, { firebase = true, lang = 'el' } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 390, height: 860, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((lang) => {
    Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') });
    window.__notifications = [];
    window.__hidden = false;
    Object.defineProperty(document, 'visibilityState', { get: () => (window.__hidden ? 'hidden' : 'visible') });
    class FakeNotification { constructor(title, o) { window.__notifications.push({ title, body: o?.body, tag: o?.tag }); } static get permission() { return 'granted'; } static requestPermission() { return Promise.resolve('granted'); } }
    window.Notification = FakeNotification;
    if (window.ServiceWorkerRegistration) ServiceWorkerRegistration.prototype.showNotification = (title, o) => { window.__notifications.push({ title, body: o?.body, tag: o?.tag }); return Promise.resolve(); };
    const toasts = [];
    window.__toasts = toasts;
    new MutationObserver(() => { const el = document.querySelector('#toast'); if (el && el.classList.contains('is-visible')) { const text = el.textContent; if (toasts.at(-1) !== text) toasts.push(text); } }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, lang);
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && m.text().trim() && !/404|cloudflareinsights|net::ERR_FAILED|CORS|Failed to load resource/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  if (firebase) {
    await page.exposeFunction('__fb', (op, k, data, extra) => backend.handle(op, k, data, extra));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const u = request.url();
      const js = (body) => request.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
      if (u.endsWith('/src/firebase-config.js')) return js(CONFIG);
      if (/\/vendor\/firebase-/.test(u) && u.endsWith('firebase-app.js')) return js(fakeApp);
      if (/\/vendor\/firebase-/.test(u) && u.endsWith('firebase-auth.js')) return js(fakeAuth);
      if (/\/vendor\/firebase-/.test(u) && u.endsWith('firebase-firestore.js')) return js(fakeFirestore);
      return request.continue();
    });
  }
  await page.goto(`${url}#settings`, { waitUntil: IDLE });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); });
  await page.reload({ waitUntil: IDLE });
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
  return page;
}

const results = [];
async function check(name, fn) {
  try { const ok = await fn(); results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(`assert: ${name}`); }
  catch (error) { console.log(`FAIL ${name}: ${error.message}`); errors.push(`assert: ${name}: ${error.message}`); }
}
// DOM click on the element itself, so a toast or the fixed bottom bar on a small screen never takes the tap.
const tap = async (page, sel) => { await page.$eval(sel, (el) => { el.scrollIntoView({ block: 'center' }); el.click(); }); };
const go = async (page, view) => { await page.evaluate((v) => { location.hash = `#${v}`; }, view); await wait(); };
const shopping = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1') || '{"shopping":[]}').shopping);
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
async function addToList(page, name, note = '') {
  await go(page, 'shopping');
  await page.$eval('#shopping-form input[name="name"]', (el) => { el.value = ''; });
  await page.type('#shopping-form input[name="name"]', name);
  if (note) await page.type('#shopping-form input[name="note"]', note);
  await page.click('#shopping-form button[type=submit]'); await wait(500);
}
async function signUp(page, email) {
  await go(page, 'settings');
  await page.type('#sync-email-form input[name=email]', email);
  await page.type('#sync-email-form input[name=password]', 'secret123');
  await page.click('#sync-email-form button[value=signup]'); await wait(1200);
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
}
async function waitFor(page, fn, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { if (await page.evaluate(fn)) return true; await wait(500); } return false; }

// ---------- Signed-out device: suggestions, notes, «Ξαναψώνισε τα ίδια» ----------
const solo = await device('solo', { firebase: false });
await check('note on add and inline note edit are saved and shown', async () => {
  await addToList(solo, 'Μακαρόνια', 'Barilla 500 γρ.');
  await addToList(solo, 'Γάλα');
  const rows = await shopping(solo);
  const shown = await solo.$eval('.shopping-list', (el) => el.textContent);
  const milk = rows.find((r) => r.name === 'Γάλα');
  await tap(solo, `[data-action="note-edit"][data-id="${milk.id}"]`); await wait();
  await solo.type('#row-note-input', 'ΔΕΛΤΑ light');
  await tap(solo, '#row-note-form button[type=submit]'); await wait();
  const after = await shopping(solo);
  return rows.find((r) => r.name === 'Μακαρόνια')?.note === 'Barilla 500 γρ.' && shown.includes('Barilla 500 γρ.') && after.find((r) => r.name === 'Γάλα')?.note === 'ΔΕΛΤΑ light'
    && (await solo.$eval('.shopping-list', (el) => el.textContent)).includes('ΔΕΛΤΑ light');
});
await check('tick, clear and «Ξαναψώνισε τα ίδια» brings the same rows (with notes) back', async () => {
  for (const id of (await shopping(solo)).map((r) => r.id)) { await tap(solo, `[data-action="toggle-shopping"][data-id="${id}"]`); await wait(250); }
  await tap(solo, '[data-action="clear-completed"]'); await wait();
  const empty = (await shopping(solo)).length === 0;
  const past = await solo.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).pastLists || []);
  await tap(solo, '#reshop'); await wait();
  const back = await shopping(solo);
  return empty && past.length === 1 && back.length === 2 && back.every((r) => !r.checked) && back.find((r) => r.name === 'Μακαρόνια')?.note === 'Barilla 500 γρ.';
});
await check('quick suggestion chips: frequent items, filtered while typing, one tap adds', async () => {
  for (const id of (await shopping(solo)).map((r) => r.id)) { await tap(solo, `[data-action="remove-shopping"][data-id="${id}"]`); await wait(400); }
  await go(solo, 'shopping');
  const chips = await solo.$$eval('#shopping-suggest .suggest-chip', (els) => els.map((el) => el.dataset.name));
  await solo.type('#shopping-form input[name="name"]', 'μακ'); await wait();
  const filtered = await solo.$$eval('#shopping-suggest .suggest-chip', (els) => els.map((el) => el.dataset.name));
  await tap(solo, '#shopping-suggest .suggest-chip'); await wait();
  const rows = await shopping(solo);
  return chips.includes('Γάλα') && chips.includes('Μακαρόνια') && JSON.stringify(filtered) === '["Μακαρόνια"]' && rows.length === 1 && rows[0].name === 'Μακαρόνια' && rows[0].note === 'Barilla 500 γρ.';
});
await check('settings: shared-list notice toggle is on by default', async () => {
  await go(solo, 'settings');
  return solo.$eval('#notify-list', (el) => el.checked);
});
await solo.screenshot({ path: '/workspace/tmp/smoke-solo-settings.png', fullPage: false });
await go(solo, 'shopping'); await solo.screenshot({ path: '/workspace/tmp/smoke-solo-shopping.png', fullPage: true });

const soloEn = await device('solo-en', { firebase: false, lang: 'en' });
await check('English: shopping view and settings have no untranslated Greek', async () => {
  await addToList(soloEn, 'Milk', 'brand X');
  const id = (await shopping(soloEn))[0].id;
  await tap(soloEn, `[data-action="toggle-shopping"][data-id="${id}"]`); await wait();
  await tap(soloEn, '[data-action="clear-completed"]'); await wait();
  await go(soloEn, 'shopping');
  const greek = await soloEn.evaluate(async () => (await import('./src/i18n.js')).untranslatedGreek(document.querySelector('#view-content')));
  await go(soloEn, 'settings');
  const greek2 = await soloEn.evaluate(async () => (await import('./src/i18n.js')).untranslatedGreek(document.querySelector('.notify-days')?.closest('section') || document.body));
  const text = await soloEn.$eval('#notify-list', (el) => el.closest('label').textContent);
  if (greek.length || greek2.length) console.log('  greek:', greek, greek2);
  await go(soloEn, 'shopping'); await soloEn.screenshot({ path: '/workspace/tmp/smoke-en-shopping.png', fullPage: true });
  return !greek.length && !greek2.length && /another member changes the shared shopping list/.test(text);
});

if (only) { console.log(errors); await browser.close(); process.exit(0); }
// ---------- Two members: notices ----------
const phone = await device('phone');
const laptop = await device('laptop');
await signUp(phone, 'giannis.test@oikos-test.gr');
let invite = '';
await check('household: invite + join', async () => {
  await tap(phone, '[data-action="sync-invite"]'); await wait(600);
  const message = await phone.$eval('#confirm-message', (el) => el.textContent);
  invite = (message.match(/uid-[a-z0-9]+\.[a-z0-9]+/) || [''])[0];
  await tap(phone, '#confirm-dialog button[value=cancel]'); await wait();
  await signUp(laptop, 'maria.test@oikos-test.gr');
  await laptop.type('#sync-join-form input[name=invite]', invite);
  await tap(laptop, '#sync-join-form button[type=submit]'); await wait(1500);
  return Boolean(invite) && /Μέλη σε αυτό το σπίτι: 2/.test(await laptop.$eval('#sync-members', (el) => el.textContent).catch(() => ''));
});
// Give Maria a name (Ποιος πλήρωσε τι → Το όνομά μου), like a real member would.
await laptop.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('spitothiki:v1'));
  const uid = Object.keys(JSON.parse(localStorage.getItem('spitothiki:sync') || '{}').writers || {}).length ? null : null;
  return s;
});
await go(laptop, 'insights');
const hasNameForm = await laptop.$('#whopaid-name');
if (hasNameForm) { await laptop.$eval('#whopaid-name', (el) => { el.value = ''; }); await laptop.type('#whopaid-name', 'Μαρία'); await tap(laptop, '#whopaid-form button[type=submit]'); await wait(800); }

await check('Maria adds milk → Giannis gets «Μαρία πρόσθεσε Γάλα» (batched), Maria gets nothing for her own change', async () => {
  await go(phone, 'overview');
  await addToList(laptop, 'Γάλα', 'ΔΕΛΤΑ 1,5%');
  await addToList(laptop, 'Ψωμί');
  const early = (await toasts(phone)).some((x) => /πρόσθεσε/.test(x));
  const got = await waitFor(phone, () => window.__toasts.some((x) => /πρόσθεσε/.test(x)), 25000);
  const list = await toasts(phone);
  const notice = list.find((x) => /πρόσθεσε/.test(x));
  const own = (await toasts(laptop)).some((x) => /πρόσθεσε/.test(x));
  const note = (await shopping(phone)).find((r) => r.name === 'Γάλα')?.note;
  console.log('  notice:', notice);
  return !early && got && /(Μαρία|Μέλος 2) πρόσθεσε Γάλα, Ψωμί/.test(notice) && list.filter((x) => /πρόσθεσε/.test(x)).length === 1 && !own && note === 'ΔΕΛΤΑ 1,5%';
});
await check('a note being typed is kept when the other member changes the list', async () => {
  await go(phone, 'shopping');
  const id = (await shopping(phone)).find((r) => r.name === 'Ψωμί').id;
  await tap(phone, `[data-action="note-edit"][data-id="${id}"]`); await wait();
  await phone.type('#row-note-input', 'ολικής άλεσης');
  await addToList(laptop, 'Ρύζι'); await wait(1500);
  const synced = (await shopping(phone)).some((r) => r.name === 'Ρύζι');
  const kept = await phone.$eval('#row-note-input', (el) => el.value).catch(() => '');
  const focused = await phone.evaluate(() => document.activeElement?.id);
  await phone.type('#row-note-input', ' 500γρ');
  await phone.$eval('#row-note-form', (f) => f.requestSubmit()); await wait();
  const saved = (await shopping(phone)).find((r) => r.id === id)?.note;
  return synced && kept === 'ολικής άλεσης' && focused === 'row-note-input' && saved === 'ολικής άλεσης 500γρ';
});
if (!quick) {
  await check('app in background: system notification with the shopping tag (after the 2-minute gap)', async () => {
    await phone.evaluate(() => { const k = 'spitothiki:notifications'; const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, enabled: true })); window.__hidden = true; });
    const rows = await shopping(laptop);
    await tap(laptop, `[data-action="toggle-shopping"][data-id="${rows.find((r) => r.name === 'Γάλα').id}"]`); await wait();
    const got = await waitFor(phone, () => window.__notifications.length > 0, 150000);
    const n = (await phone.evaluate(() => window.__notifications))[0];
    console.log('  notification:', JSON.stringify(n));
    await phone.evaluate(() => { window.__hidden = false; });
    return got && n.tag === 'spitothiki-list' && /(Μαρία|Μέλος 2) πήρε Γάλα/.test(n.title);
  });
}
await check('toggle off → no notices', async () => {
  await go(phone, 'settings');
  await tap(phone, '#notify-list'); await wait();
  const off = await phone.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:notifications')).listNotify === false);
  const before = (await toasts(phone)).length + (await phone.evaluate(() => window.__notifications.length));
  await addToList(laptop, 'Αυγά');
  await wait(quick ? 15000 : 140000);
  const after = (await toasts(phone)).filter((x) => /Αυγά/.test(x)).length + (await phone.evaluate(() => window.__notifications.filter((n) => /Αυγά/.test(n.title)).length));
  return off && after === 0 && (await shopping(phone)).some((r) => r.name === 'Αυγά') && before >= 0;
});

console.log(`shopping-extras: ${errors.length ? 'FAILED' : 'passed'}`, errors.length ? JSON.stringify(errors) : '');
await browser.close();
process.exit(errors.length ? 1 : 0);
