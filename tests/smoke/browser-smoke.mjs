import puppeteer from 'puppeteer-core';
// Usage: npm i --no-save puppeteer-core && node tests/smoke/browser-smoke.mjs <url> [width]
// Set CHROME_PATH if Chrome is not at /usr/bin/google-chrome.
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const p = await b.newPage(); await p.setViewport({ width: Number(process.argv[3]||1280), height: 900 });
const errs = [];
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('console: ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('response', r => { if (r.status()>=400 && !r.url().endsWith('favicon.ico')) errs.push('http '+r.status()+' '+r.url()); });
p.on('requestfailed', r => errs.push('reqfail: ' + r.url()));
await p.goto(url, { waitUntil: 'networkidle0' });
console.log('sw:', await p.evaluate(() => navigator.serviceWorker?.getRegistrations().then(r => r.length)));
await p.click('.nav-item[data-view="pantry"]'); await new Promise(r=>setTimeout(r,300));
console.log('hash', await p.evaluate(()=>location.hash), 'active', await p.$eval('.nav-item.is-active', e=>e.dataset.view));
await p.click('.page-heading [data-action="add-item"]').catch(e=>errs.push('click add: '+e.message));
await new Promise(r=>setTimeout(r,300));
console.log('dialog open', await p.$eval('#item-dialog', d=>d.open));
if (await p.$eval('#item-dialog', d=>d.open)) { await p.type('#item-name','Γάλα'); await p.click('#item-form button[type=submit]'); await new Promise(r=>setTimeout(r,300)); console.log('cards', (await p.$$('.inventory-card')).length); }
await p.click('.nav-item[data-view="shopping"]'); await new Promise(r=>setTimeout(r,300));
await p.type('#shopping-form input[name=name]','Ψωμί'); await p.click('#shopping-form button[type=submit]'); await new Promise(r=>setTimeout(r,300));
console.log('shop err', await p.$eval('#shopping-error', e=>e.hidden+' '+e.textContent).catch(()=>'none'));
console.log('shop rows', (await p.$$('.shopping-row')).length);
const fail = (m) => errs.push('assert: ' + m);
if (!(await p.evaluate(() => location.hash === '#shopping'))) fail('nav to shopping');
if ((await p.$$('.shopping-row')).length !== 1) fail('shopping add');
console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length?1:0);
