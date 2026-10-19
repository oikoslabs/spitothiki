// Home count cards land on the matching filtered view. Usage: node tests/smoke/home-cards-smoke.mjs <url> [width] [screenshotDir]
import puppeteer from 'puppeteer-core';
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
await browser.close();
if (errors.length) { console.log('errors:', errors); process.exit(1); }
console.log('home cards smoke: all ok');
