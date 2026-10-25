// v1.6.15: the desktop sidebar has the phone menu's sections (📷 Σάρωση απόδειξης, 🧾 Αποδείξεις); the scan button
// opens the receipt dialog; Αποδείξεις gets the active highlight; the sidebar fits/scrolls at 800px. Demo data only.
// Usage: node tests/smoke/v1615-smoke.mjs <url> [shot.png]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shot = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i)); } };
const errors = [];
const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
pg.on('pageerror', (e) => errors.push(e.message));
await pg.evaluateOnNewDocument(() => { window.__spitoProtect = true; });
await pg.setViewport({ width: 1280, height: 800 });
await pg.goto(url, { waitUntil: 'networkidle0' });
await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el'); });
await pg.reload({ waitUntil: 'networkidle0' }); await wait(600);
const labels = await pg.$$eval('.primary-nav .nav-item', (b) => b.map((x) => x.textContent.trim()));
check('sidebar has «Σάρωση απόδειξης» and «Αποδείξεις»', labels.some((l) => /Σάρωση απόδειξης/.test(l)) && labels.some((l) => /Αποδείξεις/.test(l)), labels);
const fit = await pg.$eval('.sidebar', (s) => ({ sh: s.scrollHeight, ch: s.clientHeight, ov: getComputedStyle(s).overflowY, lastVisible: (() => { const r = document.querySelector('.primary-nav [data-view="settings"]').getBoundingClientRect(); return r.bottom <= innerHeight || getComputedStyle(s).overflowY === 'auto'; })() }));
check('1280×800: sidebar fits or scrolls; «Ρυθμίσεις» reachable', fit.lastVisible, fit);
if (shot) await pg.screenshot({ path: shot });
await pg.click('.primary-nav [data-action="menu-receipt"]'); await wait(600);
check('sidebar scan opens the receipt dialog (no error, menu not open)', await pg.evaluate(() => document.querySelector('#receipt-dialog').open && !document.querySelector('#menu-sheet').open));
await pg.evaluate(() => document.querySelector('#receipt-dialog').close()); await wait(200);
await pg.click('.primary-nav [data-view="receipts"]'); await wait(600);
check('Αποδείξεις opens and is highlighted', await pg.evaluate(() => document.body.dataset.screen === 'receipts' && document.querySelector('.primary-nav [data-view="receipts"]').classList.contains('is-active') && document.querySelector('.primary-nav [data-view="receipts"]').getAttribute('aria-current') === 'page'));
await pg.setViewport({ width: 1280, height: 600 }); await wait(300);
const short = await pg.$eval('.sidebar', (s) => { s.scrollTop = 9999; const r = document.querySelector('.primary-nav [data-view="settings"]').getBoundingClientRect(); return { top: s.scrollTop, bottom: r.bottom, h: innerHeight }; });
check('1280×600: sidebar scrolls to «Ρυθμίσεις»', short.bottom <= short.h, short);
await pg.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true }); await wait(400);
check('phone: sidebar list still hidden (bottom bar unchanged)', await pg.$eval('.primary-nav', (n) => getComputedStyle(n).display === 'none'));
await pg.tap('[data-action="open-menu"]'); await wait(400);
await pg.tap('#menu-list [data-action="menu-receipt"]'); await wait(600);
check('phone menu scan still opens the receipt dialog and closes the menu', await pg.evaluate(() => document.querySelector('#receipt-dialog').open && !document.querySelector('#menu-sheet').open));
check('no page errors', !errors.length, errors);
await browser.close(); console.log(failed ? `${failed} FAILED` : 'all ok'); process.exit(failed ? 1 : 0);
