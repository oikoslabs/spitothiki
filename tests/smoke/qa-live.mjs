// Full QA sweep (run against live or local): every screen + main dialogs, phone + desktop, Greek + English.
// Checks console/page errors, horizontal overflow, elements sticking out of the screen, untranslated Greek in English,
// broken external links, month totals consistency (home = insights = sum of parts), offline reload, service worker.
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'https://spitothiki.web.app/';
const shots = process.argv[3];
const VIEWS = ['overview', 'pantry', 'shopping', 'cart', 'cook', 'bills', 'transport', 'extras', 'insights', 'settings'];
const DIALOGS = [['pantry', '[data-action="add-item"]'], ['bills', '[data-action="add-bill"]'], ['cook', '[data-action="plan-meal"]'], ['pantry', '[data-action="open-receipt"]'], ['overview', '[data-action="open-menu"]'], ['overview', '[data-action="home-signin"]']];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const findings = []; const links = new Set();
const noise = /ERR_INTERNET_DISCONNECTED|cloudflareinsights|favicon|net::ERR_FAILED|CORS|Estimating resolution|Parameter not found|diacritics/;
const clickVisible = (page, sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().height); el?.click(); return !!el; }, sel);
const layout = (page) => page.evaluate(() => {
  const out = []; const w = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > w + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${w}`);
  const scope = document.querySelector('dialog[open]') || document.querySelector('#view-content');
  for (const el of scope.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let p = el.parentElement, scroller = false; while (p && p !== scope.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break; } p = p.parentElement; }
    if (!scroller && (r.right > w + 1 || r.left < -1)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} sticks out (${Math.round(r.left)}–${Math.round(r.right)} of ${w})`);
    if (out.length > 5) break;
  }
  return out;
});
for (const lang of ['el', 'en']) for (const device of ['phone', 'desktop']) {
  const tag = `${lang}/${device}`;
  const page = await browser.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('console', (m) => { if (m.type() === 'error' && m.text().trim() && !noise.test(m.text())) findings.push(`${tag} console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => findings.push(`${tag} pageerror: ${e.message.slice(0, 200)}`));
  await page.setViewport(device === 'phone' ? { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1366, height: 900 });
  if (device === 'phone') await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((l, t) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:lang', l); if (t) localStorage.setItem('spitothiki:text-size', t); }, lang, process.env.QA_TEXT || '');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => { location.hash = '#settings'; }); await wait();
  await clickVisible(page, '[data-action="load-demo"]'); await wait(400); await clickVisible(page, '#confirm-accept'); await wait(500);
  // known spending this month: shop 10,50 + bill 40 + direct-debit bill 20 (auto-paid, next one next month) + transport 30 + extras 2,50 = 103,00
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('spitothiki:v1')); const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const m = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`; const today = `${m}-${pad(now.getDate())}`; const ts = now.toISOString();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 5); const nextKey = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-05`;
    const bill = (id, name, amount, due, extra = {}) => ({ id, name, type: 'other', amount, due, period: 1, remind: 3, reference: '', updatedAt: ts, ...extra });
    st.purchases = [...(st.purchases || []).filter((x) => !String(x.date).startsWith(m)), { id: 'qa-p1', rowId: '', name: 'QA', category: 'Άλλο', price: 10.5, date: today, updatedAt: ts }];
    st.bills = [bill('qa-b1', 'QA ρεύμα', 40, today, { paidAt: today }), bill('qa-b2', 'QA κινητό', 20, `${m}-01`, { autoPay: true }), bill('qa-b3', 'QA νερό', 99, nextKey)];
    st.transport = [{ id: 'qa-t1', type: 'fuel', amount: 30, date: today, updatedAt: ts }];
    st.extras = [{ id: 'qa-e1', category: 'coffee', amount: 2.5, qty: 1, date: today, updatedAt: ts }];
    localStorage.setItem('spitothiki:v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle0' }); await wait(600);
  for (const view of VIEWS) {
    await page.evaluate((v) => { location.hash = `#${v}`; window.scrollTo(0, 0); }, view); await wait(450);
    for (const l of await layout(page)) findings.push(`${tag}/${view} layout: ${l}`);
    if (lang === 'en') { const g = (await page.evaluate(async () => (await import('./src/i18n.js')).untranslatedGreek(document.body))).filter((x) => !/Γάλα|Ελαιόλαδο|Μήλα|Γιαούρτι|Ρύζι|Ψωμί|Αυγά|Ζυμαρικά|Καφές|Τυρί|Ντομάτες|QA /.test(x)); if (g.length) findings.push(`${tag}/${view} untranslated: ${g.slice(0, 6).join(' | ')}`); }
    (await page.$$eval('a[href^="http"]', (as) => as.map((a) => a.href))).forEach((h) => links.add(h));
    if (shots && device === 'phone') await page.screenshot({ path: `${shots}/v11-qa-${lang}-${view}-phone.png` });
  }
  for (const [view, sel] of DIALOGS) {
    await page.evaluate((v) => { location.hash = `#${v}`; }, view); await wait(400);
    if (sel.includes('plan-meal')) { await clickVisible(page, '#tab-plan'); await wait(400); }
    if (sel.includes('open-menu') && device === 'desktop') continue; // desktop shows the full sidebar instead of the ☰ menu
    if (!(await clickVisible(page, sel))) { findings.push(`${tag} could not open ${sel} on ${view}`); continue; }
    await wait(500);
    const open = await page.evaluate(() => document.querySelector('dialog[open]')?.id || '');
    if (!open && !sel.includes('home-signin')) findings.push(`${tag} ${sel}: no dialog opened`);
    if (open) {
      for (const l of await layout(page)) findings.push(`${tag} dialog #${open} layout: ${l}`);
      if (lang === 'en') { const g = await page.evaluate(async () => (await import('./src/i18n.js')).untranslatedGreek(document.querySelector('dialog[open]'))); if (g.length) findings.push(`${tag} dialog #${open} untranslated: ${g.slice(0, 6).join(' | ')}`); }
      await page.keyboard.press('Escape'); await wait(300);
    }
  }
  // month totals: home card = insights card = sum of rows
  await page.evaluate(() => { location.hash = '#overview'; }); await wait(400);
  const home = await page.$eval('#home-month-total', (e) => e.textContent.trim()).catch(() => '');
  await page.evaluate(() => { location.hash = '#insights'; }); await wait(400);
  const ins = await page.$eval('#month-grand-total', (e) => e.textContent.trim()).catch(() => '');
  const sum = await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('spitothiki:v1')); return (st.bills || []).filter((b) => b.name === 'QA κινητό').map((b) => `${b.due}:${b.paidAt || '-'}`); });
  const num = (x) => Number(x.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  if (lang === 'el' && device === 'phone') console.log('totals', { home, ins, debit: sum });
  if (Math.abs(num(home) - 103) > 0.001) findings.push(`${tag} month total ${home}, expected 103,00 (double or missing count)`);
  if (sum.length !== 2 || !sum.some((x) => x.endsWith(x.slice(0, 10)) || /:\d{4}-/.test(x))) findings.push(`${tag} direct debit not auto-paid once with next instance: ${sum.join(', ')}`);
  if (home && ins && home !== ins) findings.push(`${tag} month total mismatch: home ${home} vs insights ${ins}`);
  if (lang === 'en' && device === 'desktop') {
    // backup: export → wipe → import gives back the same data (incl. bills, extras, transport)
    const dir = await import('node:fs').then((fs) => fs.mkdtempSync('/tmp/qa-backup-'));
    const cdp = await page.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    await page.evaluate(() => { location.hash = '#settings'; }); await wait(400);
    const before = await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('spitothiki:v1')); return ['items', 'bills', 'transport', 'extras', 'purchases'].map((k) => (st[k] || []).length).join(','); });
    await clickVisible(page, '[data-action="export-backup"]'); await wait(1500);
    const fs = await import('node:fs'); const file = fs.readdirSync(dir).find((f) => f.endsWith('.json'));
    if (!file) findings.push('backup: export produced no file');
    else {
      await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('spitothiki:v1')); localStorage.setItem('spitothiki:v1', JSON.stringify({ ...st, items: [], bills: [], transport: [], extras: [], purchases: [] })); });
      await page.reload({ waitUntil: 'networkidle0' }); await page.evaluate(() => { location.hash = '#settings'; }); await wait(400);
      const input = await page.$('#backup-file'); await input.uploadFile(`${dir}/${file}`); await wait(800); await clickVisible(page, '#confirm-accept'); await wait(800);
      const after = await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('spitothiki:v1')); return ['items', 'bills', 'transport', 'extras', 'purchases'].map((k) => (st[k] || []).length).join(','); });
      if (after !== before) findings.push(`backup round trip: before ${before}, after ${after}`);
      console.log('backup', { before, after });
    }
  }
  if (lang === 'el' && device === 'phone') {
    const caches = await page.evaluate(async () => { await navigator.serviceWorker?.ready; return (await window.caches.keys()).filter((k) => k.startsWith('spitothiki-') && k !== 'spitothiki-data'); });
    const live = await page.evaluate(async () => (await (await fetch(`./sw.js?x=${Date.now()}`)).text()).match(/CACHE_VERSION = '([^']+)'/)?.[1]);
    console.log('sw caches', caches, 'live', live);
    if (caches.length !== 1 || caches[0] !== `spitothiki-${live}`) findings.push(`service worker cache ${caches.join(',')} vs live ${live}`);
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return r ? (r.active?.scriptURL || 'installing') : 'none'; });
    if (sw === 'none') findings.push('service worker not registered');
    await wait(1500);
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => findings.push(`offline reload: ${e.message}`)); await wait(1500);
    const off = await page.evaluate(() => document.querySelectorAll('#view-content *').length).catch(() => 0);
    if (off < 10) findings.push(`offline: app did not render (${off} nodes)`);
    await page.setOfflineMode(false);
  }
  await page.close();
}
for (const href of links) {
  try { const r = await fetch(href, { method: 'GET', redirect: 'follow' }); if (r.status >= 400) findings.push(`broken link ${r.status}: ${href}`); } catch (e) { findings.push(`link error: ${href} ${e.message}`); }
}
await browser.close();
console.log(`links checked: ${links.size}`);
console.log(findings.length ? `QA: ${findings.length} findings\n${[...new Set(findings)].join('\n')}` : 'QA: no findings');
process.exit(findings.length ? 1 : 0);
