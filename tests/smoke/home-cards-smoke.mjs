// Home count cards land on the matching filtered view. Usage: node tests/smoke/home-cards-smoke.mjs <url> [width] [screenshotDir]
import puppeteer from 'puppeteer-core';
import { createFakeBackend, fakeApp, fakeAuth, fakeFirestore } from './fake-firebase.mjs';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 390);
const shots = process.argv[4];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
async function check(name, fn) { try { const ok = await fn(); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); } catch (e) { console.log(`FAIL ${name}: ${e.message}`); errors.push(name); } }
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const now = new Date().toISOString();
  const item = (id, name, expiry) => ({ id, name, category: 'Γαλακτοκομικά', location: 'Ψυγείο', quantity: 1, unit: 'τεμ.', minimum: 0, expiry, createdAt: now, updatedAt: now });
  localStorage.clear();
  localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [item('a', 'Γάλα', d(3)), item('b', 'Γιαούρτι', d(-2)), item('c', 'Ρύζι', d(200)), item('d', 'Φέτα', d(1)), item('e', 'Αλάτι', '')], shopping: [{ id: 's1', name: 'Ψωμί', quantity: 1, unit: 'τεμ.', checked: false, createdAt: now, updatedAt: now }] }));
});
await page.goto(url, { waitUntil: 'networkidle0' }); await wait();
if (shots) { await page.screenshot({ path: `${shots}/home-header-phone.png` }); }
await check('home header reads «Η Σπιτοθήκη σου με μια ματιά»', async () => (await page.$eval('.home-hero h1', (e) => e.innerText.replace(/\s+/g, ' ').trim())) === 'Η Σπιτοθήκη σου με μια ματιά');
await check('«λήγουν ή έληξαν» card → pantry with only expiring/expired, expired first, clearable chip', async () => {
  await page.click('#home-card-expiring'); await wait();
  const names = await page.$$eval('#inventory-list .product-name', (els) => els.map((e) => e.textContent.trim()));
  const chip = await page.$eval('#pantry-status-filter', (e) => e.textContent).catch(() => '');
  if (shots) await page.screenshot({ path: `${shots}/pantry-expiring-filter-phone.png` });
  await page.click('[data-action="clear-pantry-status"]'); await wait();
  const all = (await page.$$('#inventory-list .product-name')).length;
  const chipGone = !(await page.$('#pantry-status-filter'));
  const ok = names.join(',') === 'Γιαούρτι,Φέτα,Γάλα' && /Λήγουν ή έληξαν/.test(chip) && all === 5 && chipGone;
  if (!ok) console.log('  expiring:', { names, chip, all, chipGone });
  return ok;
});
await check('«προϊόντα στο σπίτι» card → whole pantry (filter reset); «στη λίστα αγορών» → shopping list', async () => {
  await page.evaluate(() => { location.hash = '#overview'; }); await wait();
  await page.click('#home-card-expiring'); await wait();
  await page.click('.home-button'); await wait();
  await page.click('#home-card-all'); await wait();
  const all = (await page.$$('#inventory-list .product-name')).length === 5 && !(await page.$('#pantry-status-filter'));
  await page.evaluate(() => { location.hash = '#overview'; }); await wait();
  await page.click('#home-card-shopping'); await wait();
  const shop = (await page.evaluate(() => document.body.dataset.screen)) === 'shopping';
  return all && shop;
});
// Sign-in card: fake Firebase (signed out → card; signed in → none); sync not configured → none.
const backend = createFakeBackend();
async function device(config) {
  const context = await browser.createBrowserContext();
  const pg = await context.newPage();
  await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  await pg.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await pg.exposeFunction('__fb', (op, k, data, extra) => backend.handle(op, k, data, extra));
  await pg.setRequestInterception(true);
  pg.on('request', (request) => {
    const u = request.url();
    const js = (body) => request.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
    if (u.endsWith('/src/firebase-config.js')) return js(config);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-app.js')) return js(fakeApp);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-auth.js')) return js(fakeAuth);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-firestore.js')) return js(fakeFirestore);
    return request.continue();
  });
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.goto(url, { waitUntil: 'networkidle0' }); await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
  return pg;
}
const ON = `export const firebaseConfig = { apiKey: 'test', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'test' };\nexport const authProviders = ['google', 'password'];`;
const OFF = `export const firebaseConfig = null;\nexport const authProviders = [];`;
await check('sign-in card: shown when signed out; «Σύνδεση» opens the sync card; × hides it for 14 days', async () => {
  const pg = await device(ON);
  const shown = Boolean(await pg.$('#home-protect-card'));
  const text = await pg.$eval('#home-protect-card', (e) => e.textContent).catch(() => '');
  if (shots) await pg.screenshot({ path: `${shots}/home-signin-card-phone.png` });
  await pg.click('#protect-signin'); await wait(800);
  const landed = await pg.evaluate(() => ({ screen: document.body.dataset.screen, focus: document.activeElement?.dataset?.action || document.activeElement?.name, top: Math.round(document.querySelector('#sync-card').getBoundingClientRect().top) }));
  await pg.evaluate(() => { location.hash = '#overview'; }); await wait();
  await pg.click('[data-action="protect-snooze"]'); await wait();
  const hidden = !(await pg.$('#home-protect-card'));
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
  const stillHidden = !(await pg.$('#home-protect-card'));
  await pg.evaluate(() => localStorage.setItem('spitothiki:protect-card-snooze', String(Date.now() - 1000)));
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
  const back = Boolean(await pg.$('#home-protect-card'));
  // Sign in (fake email account) → card never shown.
  await pg.evaluate(() => { location.hash = '#settings'; }); await wait();
  await pg.type('#sync-email-form input[name=email]', 'card@example.com'); await pg.type('#sync-email-form input[name=password]', 'secret123');
  await pg.click('#sync-email-form button[value=signup]'); await wait(1200);
  await pg.evaluate(() => { location.hash = '#overview'; }); await wait(800);
  const signedInHidden = !(await pg.$('#home-protect-card'));
  await pg.browserContext().close();
  const ok = shown && /μόνο σε αυτό το κινητό/.test(text) && landed.screen === 'settings' && landed.focus === 'sync-google' && landed.top < 300 && hidden && stillHidden && back && signedInHidden;
  if (!ok) console.log('  signin:', { shown, landed, hidden, stillHidden, back, signedInHidden });
  return ok;
});
await check('protect card: sync not configured → only the Google Drive button', async () => {
  const pg = await device(OFF);
  const r = await pg.evaluate(() => ({ card: Boolean(document.querySelector('#home-protect-card')), signin: Boolean(document.querySelector('#protect-signin')), drive: Boolean(document.querySelector('#protect-drive')) }));
  await pg.browserContext().close();
  return r.card && !r.signin && r.drive;
});
await browser.close();
if (errors.length) { console.log('errors:', errors); process.exit(1); }
console.log('home cards smoke: all ok');
