// v1.6.5: no pill shift, bottom bar follows the chosen language, pinned Μενού, one shared add form, meal plan dark contrast,
// last-used vehicle, fixed monthly obligations in Λογαριασμοί, one cooking menu item, menu labels = page titles. Demo data only.
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shots = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const check = (n, ok, i) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) { failed++; if (i !== undefined) console.log('  ', JSON.stringify(i)); } };
const demo = { items: [{ id: 'i1', name: 'Αυγά', quantity: 3, unit: 'τεμ.', category: 'Γαλακτοκομικά', location: 'Ψυγείο', expiry: '', minimum: 0, updatedAt: '2026-10-01T00:00:00Z' }], shopping: [], bills: [{ id: 'b-old', name: 'ΔΕΗ', type: 'electricity', amount: 60, due: '2026-11-05', period: 1, remind: 3, updatedAt: '2026-10-01T00:00:00Z' }], vehicles: [{ id: 'veh-car', name: 'Αυτοκίνητο', updatedAt: '2026-10-01T00:00:00Z' }, { id: 'veh-moto', name: 'Μηχανάκι', updatedAt: '2026-10-01T00:00:00Z' }], transport: [], recurring: [] };
async function page(width, locale) {
  const pg = await browser.newPage(); await pg.setBypassServiceWorker(true);
  await pg.setViewport({ width, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument((l) => { window.__spitoOnboarding = true; window.__spitoProtect = true; Object.defineProperty(navigator, 'language', { get: () => l }); Object.defineProperty(navigator, 'languages', { get: () => [l] }); }, locale);
  await pg.goto(url, { waitUntil: 'networkidle0' }); return pg;
}
const setup = async (pg, extra = {}, data = demo) => { await pg.evaluate((d, x) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); localStorage.setItem('spitothiki:lang', 'el'); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); localStorage.setItem('spitothiki:v1', JSON.stringify(d)); }, data, extra); await pg.reload({ waitUntil: 'networkidle0' }); await wait(800); };
const click = (pg, s) => pg.evaluate((s) => document.querySelector(s).click(), s);
const barLabels = (pg) => pg.$$eval('.quick-bar .quick-bar-item', (b) => b.map((x) => x.querySelector('span:not(.nav-icon)').textContent.trim()));
for (const width of [412, 360]) {
  const shot = async (pg, n) => { if (shots) await pg.screenshot({ path: `${shots}/v165-${width}-${n}.png` }); };
  // 1 + 2: English browser, choose Ελληνικά in onboarding
  let pg = await page(width, 'en-US');
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); }); await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
  check(`${width}: English browser starts in English`, (await barLabels(pg)).includes('Menu'), await barLabels(pg));
  const boxes = () => pg.$$eval('#onboard-dialog .filter-chip', (b) => b.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)].join(','); }).join('|'));
  await click(pg, '[data-action="onboard-lang"][data-lang="el"]'); await wait(300);
  const b0 = await boxes();
  for (const id of ['mobile', 'dei', 'road']) { await click(pg, `[data-action="onboard-bill"][data-id="${id}"]`); await wait(120); }
  await click(pg, '[data-action="onboard-size"][data-size="large"]'); await click(pg, '[data-action="onboard-size"][data-size="normal"]'); await wait(200);
  const b1 = await boxes(); await shot(pg, 'onboarding-pills');
  await click(pg, '[data-action="onboard-bill"][data-id="mobile"]'); await wait(200); const b2 = await boxes();
  check(`${width}: picking/unpicking pills moves nothing`, b0 === b1 && b1 === b2, { b0: b0.slice(0, 80), b1: b1.slice(0, 80) });
  await click(pg, '#onboard-done'); await wait(700);
  const el = await barLabels(pg);
  check(`${width}: after Ελληνικά + Ξεκίνα the bottom bar is Greek`, el.join() === 'Σάρωση,Στη λίστα,Μικροέξοδο,Μετακίνηση,Κινήσεις,Μενού', el);
  const latin = await pg.evaluate(() => [...document.querySelectorAll('.quick-bar, .sidebar, .mobile-brand, #menu-sheet, main h1')].map((e) => e.textContent).join(' ').match(/\b[A-Za-z]{4,}\b/g) || []);
  check(`${width}: no English words left in bar/menu/titles`, latin.length === 0, latin);
  await pg.evaluate(() => document.querySelector('#toast')?.style.setProperty('display', 'none')); await shot(pg, 'home-bar-greek');
  await pg.close();
  // vice versa: Greek browser, choose English
  pg = await page(width, 'el-GR');
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:protect-sheet-seen', '1'); }); await pg.reload({ waitUntil: 'networkidle0' }); await wait(900);
  await click(pg, '[data-action="onboard-lang"][data-lang="en"]'); await wait(300); await click(pg, '#onboard-done'); await wait(700);
  const en = await barLabels(pg); const greek = await pg.evaluate(() => window.__i18n.untranslatedGreek(document.querySelector('.quick-bar')));
  check(`${width}: Greek browser + English choice → English bar`, en.at(-1) === 'Menu' && greek.length === 0, { en, greek });
  await pg.close();
  // 3: pinned Μενού, also with a customized bar
  pg = await page(width, 'el-GR');
  await setup(pg, { 'spitothiki:bottom-bar': JSON.stringify(['view:chores', 'scan', 'list', 'view:bills', 'cook']) });
  const custom = await pg.$$eval('.quick-bar .quick-bar-item', (b) => b.map((x) => x.dataset.quick || x.dataset.view || x.dataset.action));
  check(`${width}: customized bar keeps its 5 + Μενού pinned right`, custom.join() === 'chores,scan,list,bills,cook,open-menu', custom);
  check(`${width}: bar fits without overflow`, await pg.evaluate(() => document.querySelector('.quick-bar').scrollWidth <= document.querySelector('.quick-bar').clientWidth + 1));
  await click(pg, '.quick-bar-menu'); await wait(400);
  check(`${width}: bar Μενού opens the menu`, await pg.evaluate(() => document.querySelector('#menu-sheet').open));
  await shot(pg, 'menu');
  // 8: one cooking item; 9: menu labels = page titles
  const cook = await pg.$$eval('#menu-sheet .menu-item', (b) => b.filter((x) => /μαγειρ|γεύμα|φαγητ/i.test(x.textContent)).length);
  check(`${width}: one menu item for cooking/meal plan`, cook === 1 && !(await pg.$('[data-action="menu-mealplan"]')), cook);
  const items = await pg.$$eval('#menu-sheet .menu-item[data-view]', (b) => b.map((x) => [x.dataset.view, x.querySelector('span:not(.menu-icon)').textContent.trim()]));
  await pg.evaluate(() => document.querySelector('#menu-sheet').close());
  const mism = [];
  for (const [view, label] of items) { if (view === 'overview') continue; await pg.evaluate((v) => { location.hash = '#' + v; }, view); await wait(450); const h1 = await pg.$eval('main h1', (h) => h.textContent.trim()).catch(() => ''); const sec = await pg.$eval('#current-section', (h) => h.textContent.trim()); if (h1 !== label || sec !== label) mism.push({ view, label, h1, sec }); }
  check(`${width}: every menu label = page title = header`, mism.length === 0, mism);
  await pg.evaluate(() => { location.hash = '#cook'; }); await wait(400);
  check(`${width}: both tabs inside Μαγείρεμα & γεύματα`, (await pg.$$eval('.cook-tabs [role="tab"]', (t) => t.map((x) => x.textContent.trim()))).join() === '💡 Τι να μαγειρέψω,📅 Πρόγραμμα γευμάτων');
  // 4: shared add form
  await pg.evaluate(() => { location.hash = '#shopping'; }); await wait(600);
  const forms = await pg.$$eval('.item-add-form', (f) => f.map((x) => [x.id, !!x.querySelector('select[name="category"]'), x.querySelector('[type=submit]').className]));
  check(`${width}: list + recurring use the same form, both with Κατηγορία`, forms.length === 2 && forms.every((f) => f[1] && f[2] === forms[0][2]), forms);
  await pg.evaluate(() => { const f = document.querySelector('#recurring-form'); f.elements.name.value = 'Γάλα'; f.elements.category.value = f.elements.category.options[2].value; f.requestSubmit(); }); await wait(500);
  const rec = await pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).recurring?.[0]);
  check(`${width}: recurring item keeps its Κατηγορία`, rec?.name === 'Γάλα' && !!rec.category, rec);
  await pg.evaluate(() => document.querySelector('#shopping-form').scrollIntoView({ block: 'start' })); await wait(200); await shot(pg, 'shopping-form');
  check(`${width}: shopping page fits`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // 6: last-used vehicle
  await pg.evaluate(() => { location.hash = '#transport'; }); await wait(600);
  await pg.evaluate(() => { const f = document.querySelector('#transport-form'); f.elements.type.value = 'fuel'; f.elements.type.dispatchEvent(new Event('change', { bubbles: true })); f.elements.amount.value = '40'; f.elements.vehicle.value = 'veh-moto'; f.requestSubmit(); }); await wait(600);
  const sel = await pg.$eval('#transport-vehicle', (s) => s.value);
  check(`${width}: next new entry preselects the last vehicle (Μηχανάκι)`, sel === 'veh-moto', sel);
  await pg.evaluate(() => { const f = document.querySelector('#transport-form'); f.elements.type.value = 'fuel'; f.elements.type.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#transport-add').scrollIntoView({ block: 'start' }); }); await wait(300); await shot(pg, 'transport-form');
  // 7: bills with gym
  await pg.evaluate(() => { location.hash = '#bills'; }); await wait(600);
  await click(pg, '[data-action="add-bill"]'); await wait(400);
  const chips = await pg.$$eval('#bill-chips [data-action="bill-chip"]', (b) => b.map((x) => x.textContent.trim()));
  check(`${width}: fixed-obligation chips offered`, chips.some((c) => c.includes('Γυμναστήριο')) && chips.some((c) => c.includes('Φροντιστήριο')), chips);
  await click(pg, '[data-action="bill-chip"][data-type="gym"]'); await wait(200);
  await pg.evaluate(() => { const f = document.querySelector('#bill-form'); f.elements.amount.value = '35'; f.elements.due.value = '2026-11-01'; }); await shot(pg, 'bill-dialog-gym');
  await pg.evaluate(() => document.querySelector('#bill-form').requestSubmit()); await wait(600);
  const bills = await pg.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).bills.map((b) => `${b.name}:${b.type}`));
  check(`${width}: gym saved as a monthly obligation, old bill intact`, bills.includes('Γυμναστήριο:gym') && bills.includes('ΔΕΗ:electricity'), bills);
  await shot(pg, 'bills-gym');
  await pg.close();
  // 5: meal plan dark contrast
  pg = await page(width, 'el-GR');
  await setup(pg, { 'spitothiki:theme': 'dark' });
  await pg.evaluate(() => { location.hash = '#cook'; }); await wait(500); await click(pg, '#tab-plan'); await wait(600);
  const ratio = await pg.evaluate(() => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number); const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const d = document.querySelector('.plan-day'); if (!d) return null; const cs = getComputedStyle(d); const page = getComputedStyle(document.body).backgroundColor; const name = getComputedStyle(d.querySelector('.plan-day-name'));
    const slot = d.querySelector('.plan-slot'); return { text: cr(name.color, cs.backgroundColor), slot: slot ? cr(getComputedStyle(slot).color, cs.backgroundColor) : 99, edge: cr(cs.borderTopColor, page) };
  });
  check(`${width}: dark meal plan: text ≥4.5:1, card edge ≥3:1`, ratio && ratio.text >= 4.5 && ratio.slot >= 4.5 && ratio.edge >= 3, ratio);
  await pg.evaluate(() => document.querySelector('.plan-day')?.scrollIntoView({ block: 'start' })); await wait(200); await shot(pg, 'mealplan-dark');
  await pg.close();
}
await browser.close(); process.exit(failed ? 1 : 0);
