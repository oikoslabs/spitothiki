// v1.9.4 end-to-end against REAL Firebase (self-hosted SDK): sign up a throwaway email account, then delete it
// with Settings › «Διαγραφή λογαριασμού». Proves the self-hosted SDK loads and that the Auth user is really gone.
// The anonymous source counter is blocked so the test does not count as a sign-up.
// Usage: node tests/smoke/account-delete-real.mjs https://spitothiki--<channel>.web.app/
import puppeteer from 'puppeteer-core';
import { firebaseConfig } from '../../src/firebase-config.js';
const url = process.argv[2];
const email = `smoke-delete-${Date.now()}@example.com`; const password = `T${Math.random().toString(36).slice(2)}x9!`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
const hosts = new Set(); const errors = [];
await page.setRequestInterception(true);
page.on('request', (r) => { const u = new URL(r.url()); hosts.add(u.hostname); if (u.hostname.startsWith('spitothiki-stats')) return r.abort(); r.continue(); });
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => { localStorage.setItem('spitothiki:onboarded', '1'); });
await page.goto(`${url}#settings`, { waitUntil: 'networkidle0' });
const cleanup = async () => { const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then((x) => x.json()); if (r.idToken) await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseConfig.apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: r.idToken }) }); console.error('cleanup: test user existed =', Boolean(r.idToken)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const textHas = (s) => page.evaluate((x) => document.body.textContent.includes(x), s);
await page.waitForSelector('#sync-email-form', { timeout: 30000 });
await page.type('#sync-email-form [name="email"]', email); await page.type('#sync-email-form [name="password"]', password);
await page.click('#sync-email-form button[value="signup"]');
await page.waitForFunction(() => /Συγχρονισμένο|Synced/.test(document.querySelector('#sync-status')?.textContent || ''), { timeout: 30000 }).catch(async (e) => { console.error('sync status:', await page.evaluate(() => document.querySelector('#sync-status')?.textContent), errors); await cleanup(); process.exit(1); });
console.log('ok   signed up and synced with the self-hosted Firebase SDK');
await page.evaluate(() => { document.querySelector('#account-delete').open = true; });
await page.type('#account-delete-word', 'λάθος'); await page.click('#account-delete-form button[type="submit"]'); await wait(400);
if (await page.evaluate(() => document.querySelector('#confirm-dialog')?.open)) throw new Error('wrong word should not open the confirm');
console.log('ok   wrong word refused');
await page.$eval('#account-delete-word', (e) => { e.value = ''; }); await page.type('#account-delete-word', 'ΔΙΑΓΡΑΦΗ');
await page.click('#account-delete-form button[type="submit"]');
await page.waitForSelector('#confirm-dialog[open]'); await page.click('#confirm-accept');
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
const toast = await page.waitForFunction(() => /Ο λογαριασμός σου και τα δεδομένα σου διαγράφηκαν|Your account and your data were deleted/.test(document.body.textContent), { timeout: 8000 }).then(() => true, () => false);
const signedOut = await page.evaluate(() => Boolean(document.querySelector('#sync-email-form')));
const local = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('spitothiki') && !/spitothiki:(onboarded|auto-base|src|source|lang|seen)/.test(k)));
console.log('local keys after reload:', await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('spitothiki'))));
console.log(`ok   after delete: toast=${toast} signedOut=${signedOut} personalKeysLeft=${local.length}`);
await browser.close();
// The same email can be registered again only if the old Auth user is gone; then remove that one too.
const api = (p, body) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${p}?key=${firebaseConfig.apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const again = await api('signUp', { email, password, returnSecureToken: true });
if (again.idToken) await api('delete', { idToken: again.idToken });
console.log(`ok   auth user really deleted (email free again): ${Boolean(again.idToken)}${again.error ? ` ${again.error.message}` : ''}`);
const third = [...hosts].filter((h) => !/spitothiki|googleapis\.com$|google\.com$|cloudflareinsights|firebaseapp\.com$/.test(h));
console.log('hosts contacted:', [...hosts].sort().join(', '));
const cdn = [...hosts].filter((h) => /jsdelivr|gstatic|unpkg/.test(h));
if (cdn.length || !toast || !signedOut || local.length || !again.idToken || errors.length) { console.error('FAILED', { cdn, third, errors }); process.exit(1); }
console.log('account delete (real): all ok');
