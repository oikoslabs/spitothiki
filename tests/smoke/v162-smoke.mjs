// v1.6.2: choose the bottom-bar shortcuts (up to 5), reorder, reset; default unchanged. Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i) console.log('  ', JSON.stringify(i)); } };
for (const width of [412, 360]) {
  const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
  const shot = async (n) => { if (shots) await pg.screenshot({ path: `${shots}/v162-${width}-${n}.png` }); };
  await pg.setViewport({ width, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument(() => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [], shopping: [], bills: [] })); });
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(800);
  const bar = () => pg.$$eval('.quick-bar .quick-bar-item', (b) => b.map((x) => x.dataset.quick || `view:${x.dataset.view}`));
  check(`${width}: default bar unchanged`, (await bar()).join() === 'scan,list,extra,transport,all', await bar());
  await pg.evaluate(() => { location.hash = '#settings'; }); await wait(700);
  await pg.evaluate(() => document.querySelector('#bar-card').scrollIntoView({ block: 'start' })); await wait(200); await shot('1-settings');
  await pg.evaluate(() => document.querySelector('#bar-list [data-bar="extra"] [data-action="bar-toggle"]').click()); await wait(200);
  await pg.evaluate(() => document.querySelector('#bar-add [data-id="view:chores"]').click()); await wait(200);
  for (let i = 0; i < 3; i++) await pg.evaluate(() => document.querySelector('#bar-list [data-bar="view:chores"] [data-delta="-1"]').click());
  await wait(200); await pg.evaluate(() => document.querySelector('#bar-card').scrollIntoView({ block: 'start' })); await wait(200); await shot('2-chosen');
  check(`${width}: Δουλειές added and moved left, Μικροέξοδο removed`, (await bar()).join() === 'scan,view:chores,list,transport,all', await bar());
  check(`${width}: full bar disables the add chips`, await pg.$eval('#bar-add button', (b) => b.disabled));
  check(`${width}: nothing sticks out sideways`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pg.reload({ waitUntil: 'networkidle0' }); await wait(700);
  check(`${width}: choice kept after reopening`, (await bar()).join() === 'scan,view:chores,list,transport,all');
  await pg.evaluate(() => document.querySelector('.quick-bar [data-view="chores"]').click()); await wait(600);
  check(`${width}: bar Δουλειές opens the chores page`, await pg.evaluate(() => location.hash === '#chores')); await shot('3-bar-chores');
  await pg.evaluate(() => { location.hash = '#settings'; }); await wait(600);
  await pg.evaluate(() => document.querySelector('#bar-reset').click()); await wait(300);
  check(`${width}: Επαναφορά restores the default`, (await bar()).join() === 'scan,list,extra,transport,all');
  await pg.close();
}
await browser.close(); process.exit(failed ? 1 : 0);
