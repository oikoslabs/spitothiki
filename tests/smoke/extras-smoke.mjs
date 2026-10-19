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
async function nav(view) { const direct = await page.$eval(`.nav-item[data-view="${view}"]`, (e) => e.offsetParent !== null).catch(() => false); if (direct) await page.click(`.nav-item[data-view="${view}"]`); else { await page.evaluate(() => document.querySelector('[data-action="open-menu"]').click()); await wait(200); await page.click(`#menu-sheet [data-view="${view}"]`); } await wait(); }
const sfx = lang === 'en' ? '-en' : '';

await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'networkidle0' });

await check('menu has Μικροέξοδα; no fixed buttons, faint suggestion chips instead', async () => {
  await nav('extras');
  const ok = (await page.evaluate(() => document.body.dataset.screen)) === 'extras' && (await page.$$('.extras-quick-button')).length === 0 && (await page.$$('.extras-chip')).length === 4;
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  await shot(`feature-extras-empty-suggestions${sfx}-phone.png`, false);
  return ok;
});
await check('a suggestion becomes a button only when used (asks the price); then one tap + qty/undo', async () => {
  await tap('[data-action="extras-suggest"][data-id="coffee"]');
  const asked = Boolean(await page.$('#extras-price-form'));
  await page.type('#extras-ask-amount', '2.5'); await tap('#extras-ask-save');
  const chipsGone = (await page.$$('.extras-chip')).length === 0 && (await page.$$('.extras-quick-button')).length === 1;
  await tap('[data-action="extras-quick"][data-id="coffee"]');
  const bar = Boolean(await page.$('#extras-last'));
  await tap('[data-action="extras-qty"][data-delta="1"]');
  let s = await stored();
  const two = s.extras.length === 2 && s.extras[1].qty === 2 && s.extras[1].amount === 5;
  await tap('#extras-undo');
  s = await stored();
  return asked && chipsGone && bar && two && s.extras.length === 1 && s.extras[0].amount === 2.5 && s.extraCategories.length === 1;
});
await check('typing an item once makes a button (emoji guessed); most used first; same name re-uses the button; manual form; rename', async () => {
  const typeNew = async (name, amount, emoji = '') => { if (emoji) await page.type('#extras-new-emoji', emoji); await page.type('#extras-new-name', name); await page.type('#extras-new-amount', amount); await tap('#extras-new-save'); };
  await typeNew('Φρέντο', '2.80');
  const s1 = await stored();
  const freddo = s1.extraCategories.find((c) => c.name === 'Φρέντο');
  for (let i = 0; i < 3; i += 1) await tap(`[data-action="extras-quick"][data-id="${freddo.id}"]`);
  await typeNew('Λαχεία', '3', '🎟️');
  await typeNew('Τυρόπιτα', '1.80');
  await typeNew('φρεντο', '2.80');
  const s2 = await stored();
  const tyropita = s2.extraCategories.find((c) => c.name === 'Τυρόπιτα');
  const order = await page.$$eval('.extras-quick-button', (els) => els.map((e) => e.dataset.id));
  // Manual form (other date, 2 pieces).
  await page.$eval('#extras-add', (e) => { e.open = true; }); await wait();
  const today = await page.$eval('#extras-date', (e) => e.value);
  await page.select('#extras-category', tyropita.id);
  await page.type('#extras-amount', '4.80'); await page.$eval('#extras-qty', (e) => { e.value = '2'; }); await page.$eval('#extras-date', (e, d) => { e.value = d; }, `${today.slice(0, 8)}01`);
  await tap('#extras-save');
  // Rename Λαχεία → Τζόκερ.
  const lotto = s2.extraCategories.find((c) => c.name === 'Λαχεία');
  await page.$eval('#extras-categories', (e) => { e.open = true; }); await wait();
  await tap(`[data-action="extras-cat-edit"][data-id="${lotto.id}"]`);
  await page.$eval('#extras-cat-edit-form input[name="name"]', (e) => { e.value = ''; }); await page.type('#extras-cat-edit-form input[name="name"]', 'Τζόκερ');
  await tap('#extras-cat-edit-form button[type="submit"]');
  const renameErr = await page.$eval('#extras-cat-error', (e) => e.textContent).catch(() => 'no-err-el'); const editOpen = Boolean(await page.$('#extras-cat-edit-form'));
  const s3 = await stored();
  const total = await page.$eval('#extras-total', (e) => e.textContent);
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(2800);
  await shot(`feature-extras-custom-buttons${sfx}-phone.png`, false);
  await shot(`feature-extras-main${sfx}-phone.png`, false);
  await shot(`feature-extras-main-full${sfx}-phone.png`);
  const ok = freddo.emoji === '☕' && tyropita.emoji === '🥪' && s2.extraCategories.length === 4 && s2.extras.filter((e) => e.category === freddo.id).length === 5
    && order[0] === freddo.id && order.length === 4 && s3.extraCategories.some((c) => c.id === lotto.id && c.name === 'Τζόκερ') && /26[.,]10/.test(total);
  if (!ok) console.log('  buttons:', { renameErr, editOpen, order, total, cats: s3.extraCategories.map((c) => [c.name, c.emoji]) });
  return ok;
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
  return /\(9\)/.test(label) && open && rows === 9 && esc && x && back && edit.length > 0;
});
await check('insights: extras card and in monthly grand total', async () => {
  await nav('insights');
  const card = await page.$eval('#extras-insights-total', (e) => e.textContent);
  const totals = await page.$eval('#month-totals-card', (e) => e.textContent);
  const grand = await page.$eval('#month-grand-total', (e) => e.textContent);
  await page.$eval('#month-totals-card', (e) => e.scrollIntoView({ block: 'start' }));
  await shot(`feature-extras-month-totals${sfx}-phone.png`, false);
  return /26[.,]10/.test(card) && /26[.,]10/.test(grand) && /Μικροέξοδα|Small expenses/.test(totals);
});
await check('☕ quick action opens the section; migration keeps only old defaults that have entries', async () => {
  const quick = await page.$('.quick-bar [data-quick="extra"]');
  if (quick && await quick.evaluate((e) => e.offsetParent !== null)) { await quick.click(); await wait(); }
  else await page.evaluate(() => { location.hash = '#extras'; });
  await wait();
  const opened = (await page.evaluate(() => document.body.dataset.screen)) === 'extras';
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('spitothiki:v1')); const now = new Date().toISOString(); const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    st.extraCategories = []; st.extras = [{ id: 'old1', category: 'papers', amount: 1.2, qty: 1, date: day, note: '', createdAt: now, updatedAt: now }]; localStorage.setItem('spitothiki:v1', JSON.stringify(st)); });
  await page.reload({ waitUntil: 'networkidle0' }); await wait();
  const ids = await page.$$eval('.extras-quick-button', (els) => els.map((e) => e.dataset.id));
  const label = await page.$eval('.extras-quick-button .extras-name', (e) => e.textContent);
  return opened && ids.length === 1 && ids[0] === 'papers' && /Χαρτάκια|Rolling papers/.test(label);
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
