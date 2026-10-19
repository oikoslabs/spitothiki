// Small expenses (Μικροέξοδα) smoke test: quick buttons, first-price prompt, undo/qty, manual form,
// custom categories, history modal (×/Esc/back), monthly totals in Insights, English mode.
// Usage: node tests/smoke/extras-smoke.mjs <url> [width] [el|en] [screenshotDir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const width = Number(process.argv[3] || 390);
const lang = process.argv[4] || 'el';
const shots = process.argv[5];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
await page.evaluateOnNewDocument((lang) => { Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') }); }, lang);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1') || '{}'));
async function tap(sel) { await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(150); await page.click(sel); await wait(); }
async function check(name, fn) { try { const ok = await fn(); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) errors.push(name); } catch (e) { console.log(`FAIL ${name}: ${e.message}`); errors.push(name); } }
const shot = async (name, full = true) => { if (shots) await page.screenshot({ path: `${shots}/${name}`, fullPage: full }); };
async function nav(view) { const direct = await page.$eval(`.nav-item[data-view="${view}"]`, (e) => e.offsetParent !== null).catch(() => false); if (direct) await page.click(`.nav-item[data-view="${view}"]`); else { await page.click('[data-action="open-menu"]:not([hidden])').catch(() => page.evaluate(() => document.querySelector('[data-action="open-menu"]').click())); await wait(200); await page.click(`#menu-sheet [data-view="${view}"]`); } await wait(); }
const sfx = lang === 'en' ? '-en' : '';

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'networkidle0' });

await check('menu has Μικροέξοδα and opens it', async () => {
  await nav('extras');
  return (await page.evaluate(() => document.body.dataset.screen)) === 'extras' && (await page.$$('.extras-quick-button')).length === 5;
});
await check('first tap asks for the price, then one tap re-uses it; qty +/undo', async () => {
  await tap('[data-action="extras-quick"][data-id="coffee"]');
  const asked = Boolean(await page.$('#extras-price-form'));
  await page.type('#extras-ask-amount', '2.5'); await tap('#extras-ask-save');
  await tap('[data-action="extras-quick"][data-id="coffee"]');
  const bar = Boolean(await page.$('#extras-last'));
  await tap('[data-action="extras-qty"][data-delta="1"]');
  let s = await stored();
  const two = s.extras.length === 2 && s.extras[1].qty === 2 && s.extras[1].amount === 5;
  await tap('#extras-undo');
  s = await stored();
  return asked && bar && two && s.extras.length === 1 && s.extras[0].amount === 2.5;
});
await check('manual form, custom category, rename default, totals', async () => {
  const today = await page.$eval('#extras-date', (e) => e.value);
  const month = today.slice(0, 8);
  await page.select('#extras-category', 'tobacco');
  await page.type('#extras-amount', '4.80'); await page.$eval('#extras-date', (e, d) => { e.value = d; }, `${month}01`);
  await tap('#extras-save');
  await page.$eval('#extras-categories', (e) => { e.open = true; });
  await page.type('#extras-cat-form input[name="emoji"]', '🎟️'); await page.type('#extras-cat-form input[name="name"]', 'Λαχεία');
  await tap('#extras-cat-form button[type="submit"]');
  const custom = (await stored()).extraCategories?.find((c) => c.name === 'Λαχεία');
  await tap(`[data-action="extras-quick"][data-id="${custom.id}"]`);
  await page.type('#extras-ask-amount', '3'); await tap('#extras-ask-save');
  await tap('[data-action="extras-quick"][data-id="snack"]');
  await page.type('#extras-ask-amount', '3.20'); await tap('#extras-ask-save');
  await tap('[data-action="extras-quick"][data-id="coffee"]');
  await tap('[data-action="extras-quick"][data-id="coffee"]');
  const total = await page.$eval('#extras-total', (e) => e.textContent);
  const quickCount = (await page.$$('.extras-quick-button')).length;
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(2800);
  await shot(`feature-extras-main${sfx}-phone.png`, false);
  await shot(`feature-extras-main-full${sfx}-phone.png`);
  return /18[.,]50/.test(total) && quickCount === 6;
});
await check('history modal: rows, Esc / × / back close, edit fills the form', async () => {
  const label = await page.$eval('#extras-history-open', (e) => e.textContent);
  await tap('#extras-history-open');
  const open = await page.$eval('#extras-history-dialog', (e) => e.open);
  const rows = (await page.$$('#extras-history-dialog .extras-row')).length;
  await shot(`feature-extras-history-modal${sfx}-phone.png`, false);
  await page.keyboard.press('Escape'); await wait();
  const esc = await page.$eval('#extras-history-dialog', (e) => !e.open);
  await tap('#extras-history-open'); await page.click('[data-action="close-extras-history"]'); await wait();
  const x = await page.$eval('#extras-history-dialog', (e) => !e.open);
  await tap('#extras-history-open'); await page.goBack(); await wait(500);
  const back = await page.$eval('#extras-history-dialog', (e) => !e.open) && (await page.evaluate(() => document.body.dataset.screen)) === 'extras';
  await tap('#extras-history-open');
  await page.click('#extras-history-dialog [data-action="extras-edit"]'); await wait(500);
  const edit = await page.$eval('#extras-form input[name="entryId"]', (e) => e.value);
  await tap('[data-action="extras-cancel"]');
  return /\(6\)/.test(label) && open && rows === 6 && esc && x && back && edit.length > 0;
});
await check('insights: extras card and in monthly grand total', async () => {
  await nav('insights');
  const card = await page.$eval('#extras-insights-total', (e) => e.textContent);
  const totals = await page.$eval('#month-totals-card', (e) => e.textContent);
  const grand = await page.$eval('#month-grand-total', (e) => e.textContent);
  await page.$eval('#month-totals-card', (e) => e.scrollIntoView({ block: 'start' }));
  await shot(`feature-extras-month-totals${sfx}-phone.png`, false);
  return /18[.,]50/.test(card) && /18[.,]50/.test(grand) && /Μικροέξοδα|Small expenses/.test(totals);
});
if (lang === 'en') await check('english: no Greek left in extras chrome', async () => {
  await nav('extras');
  const left = (await page.evaluate(() => window.__i18n.untranslatedGreek())).filter((s) => !/Λαχεία/.test(s));
  if (left.length) console.log('  greek:', left);
  return !left.length;
});
await browser.close();
if (errors.length) { console.log('errors:', errors); process.exit(1); }
console.log('extras smoke: all ok');
