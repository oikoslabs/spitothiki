// v1.5.1: «protect your data»: one-time sheet, merged home card, Settings badge, demo hint; nothing for protected users.
// Usage: node tests/smoke/v151-smoke.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';
import { createFakeBackend, fakeApp, fakeAuth, fakeFirestore } from './fake-firebase.mjs';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const errors = []; let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) { failed++; if (info) console.log('  ', JSON.stringify(info)); } };
const shot = (pg, n) => shots && pg.screenshot({ path: `${shots}/${n}.png` });
const CONFIG = `export const firebaseConfig = { apiKey: 'test', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'test' };\nexport const authProviders = ['google', 'password'];`;
const backend = createFakeBackend();
async function device(seed = {}) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await pg.exposeFunction('__fb', (op, k, data, extra) => backend.handle(op, k, data, extra));
  await pg.setRequestInterception(true);
  pg.on('request', (request) => {
    const u = request.url();
    const js = (body) => request.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
    if (u.endsWith('/src/firebase-config.js')) return js(CONFIG);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-app.js')) return js(fakeApp);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-auth.js')) return js(fakeAuth);
    if (/gstatic\.com\/firebasejs\/|\/vendor\/firebase-/.test(u) && u.endsWith('firebase-firestore.js')) return js(fakeFirestore);
    return request.continue();
  });
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate((s) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
  return pg;
}
const isOpen = (pg, id) => pg.evaluate((i) => Boolean(document.querySelector(i)?.open), id);
const has = (pg, sel) => pg.evaluate((s) => Boolean(document.querySelector(s)), sel);

// 1) New user: 3 questions first, then the one-time sheet.
let pg = await device();
check('new user: onboarding first, no sheet on top', await isOpen(pg, '#onboard-dialog') && !(await isOpen(pg, '#protect-dialog')));
await pg.click('[data-action="onboard-skip"]'); await wait(900);
const sheetText = await pg.$eval('#protect-dialog', (d) => d.textContent).catch(() => '');
check('after onboarding: one-time sheet with Σύνδεση / Google Drive / Αργότερα', await isOpen(pg, '#protect-dialog') && /μόνο σε αυτό το κινητό/.test(sheetText) && await has(pg, '#sheet-signin') && await has(pg, '#sheet-drive') && await has(pg, '#sheet-later'), { sheetText });
await shot(pg, 'v151-sheet');
await pg.click('#sheet-later'); await wait();
check('Αργότερα closes it; home shows the single protect card', !(await isOpen(pg, '#protect-dialog')) && await has(pg, '#home-protect-card') && !(await has(pg, '#home-backup-card')) && !(await has(pg, '#home-signin-card')));
await shot(pg, 'v151-home-card');
await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
check('sheet never shown twice', !(await isOpen(pg, '#protect-dialog')));
await pg.evaluate(() => { location.hash = '#settings'; }); await wait(700);
const badge = await pg.$eval('#storage-badge', (e) => e.textContent).catch(() => '');
check('Settings badge: 📱 Μόνο στο κινητό', /Μόνο στο κινητό/.test(badge), { badge });
await shot(pg, 'v151-settings-local');
check('demo hint present', await has(pg, '#demo-protect-hint'));
await pg.evaluate(() => { document.querySelector('#settings-advanced').open = true; }); await wait(600); await pg.evaluate(() => document.querySelector('#demo-protect-hint').scrollIntoView({ block: 'center' })); await wait(600); await pg.evaluate(() => document.querySelector('#demo-protect-hint').scrollIntoView({ block: 'center' })); await wait(300);
await shot(pg, 'v151-demo-hint');
// snooze
await pg.evaluate(() => { location.hash = '#overview'; }); await wait(600);
await pg.click('[data-action="protect-snooze"]'); await wait();
check('× hides the card', !(await has(pg, '#home-protect-card')));
// sign in → badge synced, card gone
await pg.evaluate(() => { localStorage.removeItem('spitothiki:protect-card-snooze'); location.hash = '#settings'; }); await wait(600);
await pg.type('#sync-email-form input[name=email]', 'v151@example.com'); await pg.type('#sync-email-form input[name=password]', 'secret123');
await pg.click('#sync-email-form button[value=signup]'); await wait(1500);
const badge2 = await pg.$eval('#storage-badge', (e) => e.textContent).catch(() => '');
check('signed in: badge ☁️ Συγχρονισμένο', /Συγχρονισμένο/.test(badge2), { badge2 });
await pg.evaluate(() => window.scrollTo(0, 0)); await shot(pg, 'v151-settings-synced');
await pg.evaluate(() => { location.hash = '#overview'; }); await wait(700);
check('signed in: no protect card on home', !(await has(pg, '#home-protect-card')));
await shot(pg, 'v151-home-signedin');
await pg.browserContext().close();

// 2) Existing user with Drive backup on (not signed in): nothing new appears.
pg = await device({ 'spitothiki:onboarded': '1', 'spitothiki:drive-enabled': '1', 'spitothiki:v1': JSON.stringify({ items: [{ id: 'a', name: 'Γάλα', quantity: 1, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: '' }], shopping: [] }) });
check('Drive on: no sheet, no home card', !(await isOpen(pg, '#protect-dialog')) && !(await has(pg, '#home-protect-card')));
await shot(pg, 'v151-home-drive');
await pg.evaluate(() => { location.hash = '#settings'; }); await wait(700);
const badge3 = await pg.$eval('#storage-badge', (e) => e.textContent).catch(() => '');
check('Drive on: badge ☁️ Συγχρονισμένο, no demo hint', /Συγχρονισμένο/.test(badge3) && !(await has(pg, '#demo-protect-hint')), { badge3 });
await shot(pg, 'v151-settings-drive');
await pg.browserContext().close();

// 3) Existing unprotected user with data: sheet once on first v1.5.1 launch.
pg = await device({ 'spitothiki:onboarded': '1', 'spitothiki:v1': JSON.stringify({ items: [{ id: 'a', name: 'Γάλα', quantity: 1, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά', location: '', expiry: '' }], shopping: [] }) });
check('existing unprotected user: sheet once', await isOpen(pg, '#protect-dialog'));
await pg.click('#sheet-signin'); await wait(900);
check('sheet «Σύνδεση» opens the sync card in Settings', (await pg.evaluate(() => document.body.dataset.screen)) === 'settings' && !(await isOpen(pg, '#protect-dialog')));
await pg.browserContext().close();
await browser.close();
if (errors.length) { console.log('errors:', errors); failed++; }
console.log(failed ? `v151 smoke: ${failed} failed` : 'v151 smoke: all ok');
process.exit(failed ? 1 : 0);
