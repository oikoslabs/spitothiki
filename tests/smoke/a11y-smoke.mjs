// Accessibility pass: axe-core (WCAG 2 A/AA) on every main screen, phone + desktop, Greek + English,
// plus tap targets ≥44px and dialog focus trap / Escape / focus return.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://127.0.0.1:8080/';
const report = process.argv.includes('--report');
const axe = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const VIEWS = ['overview', 'pantry', 'shopping', 'cart', 'cook', 'bills', 'transport', 'extras', 'insights', 'settings'];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const failures = [];
for (const lang of ['el', 'en']) for (const device of ['phone', 'desktop']) {
  const page = await browser.newPage(); await page.setBypassServiceWorker(true);
  page.on('dialog', (d) => d.accept());
  await page.setViewport(device === 'phone' ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); localStorage.setItem('spitothiki:lang', l); }, lang);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => { location.hash = '#settings'; }); await wait();
  await page.evaluate(() => document.querySelector('[data-action="load-demo"]').click()); await wait(400);
  await page.evaluate(() => document.querySelector('#confirm-accept')?.click()); await wait(400);
  await page.addScriptTag({ content: axe });
  for (const view of VIEWS) {
    await page.evaluate((v) => { location.hash = `#${v}`; window.scrollTo(0, 0); }, view); await wait(350);
    const res = await page.evaluate(async () => {
      const r = await window.axe.run({ exclude: [['#toast']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n')[1]) }));
    });
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary')]
      .filter((el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('dialog:not([open]), [hidden]')) return false;
        if (el.matches('.visually-hidden')) return false;
        if (el.matches('input[type=checkbox], input[type=radio]')) { const l = el.closest('label'); if (l) { const lr = l.getBoundingClientRect(); return lr.height < 44 && lr.width < 44; } }
        return r.height < 44 && !(el.closest('p, li') && el.tagName === 'A'); })
      .slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} [${el.dataset.action || el.textContent.trim().slice(0, 20)}] ${Math.round(el.getBoundingClientRect().height)}px`));
    for (const v of res) failures.push(`${lang}/${device}/${view} axe ${v.id} (${v.impact}, ${v.n}) ${report ? JSON.stringify(v.nodes) : ''}`);
    if (device === 'phone' && small.length) failures.push(`${lang}/${device}/${view} small targets: ${small.join(' | ')}`);
  }
  if (lang === 'el') for (const theme of ['dark', 'high']) {
    await page.evaluate((th) => { if (th === 'dark') document.documentElement.dataset.theme = 'dark'; else { document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.contrast = 'high'; } }, theme);
    for (const view of ['overview', 'pantry', 'bills', 'settings']) {
      await page.evaluate((v) => { location.hash = `#${v}`; }, view); await wait(350);
      const ids = await page.evaluate(async () => (await window.axe.run({ exclude: [['#toast']] }, { runOnly: { type: 'rule', values: ['color-contrast'] } })).violations.flatMap((v) => v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.failureSummary || '').split('\n')[1])));
      if (ids.length) failures.push(`${theme}/${device}/${view} contrast: ${ids.join(' | ')}`);
    }
    await page.evaluate(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.contrast; });
  }
  if (lang === 'el' && device === 'phone') {
    // dialog focus: opens with focus inside, Tab stays inside, Escape closes and focus returns
    await page.evaluate(() => { location.hash = '#pantry'; }); await wait();
    await page.evaluate(() => { const el = [...document.querySelectorAll('[data-action="add-item"]')].find((e) => e.getBoundingClientRect().height); el?.setAttribute('data-a11y-opener', ''); });
    const opener = await page.$('[data-a11y-opener]');
    if (opener) {
      await opener.focus(); await page.keyboard.press('Enter'); await wait(400);
      const inside = await page.evaluate(() => !!document.activeElement.closest('dialog[open]'));
      const dlg = await page.evaluate(async () => (await window.axe.run('dialog[open]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map((v) => v.id));
      if (dlg.length) failures.push(`item dialog axe: ${dlg.join(', ')}`);
      for (let i = 0; i < 25; i += 1) await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(() => !!document.activeElement.closest('dialog[open]'));
      await page.keyboard.press('Escape'); await wait(300);
      const back = await page.evaluate(() => !document.querySelector('dialog[open]') && document.activeElement.hasAttribute('data-a11y-opener'));
      if (!inside || !stillInside || !back) failures.push(`dialog focus: inside=${inside} trapped=${stillInside} returned=${back}`);
    } else failures.push('dialog focus: no add opener found');
  }
  await page.close();
}
await browser.close();
console.log(failures.length ? `a11y smoke: ${failures.length} issues\n` + failures.join('\n') : 'a11y smoke: all ok');
process.exit(failures.length ? 1 : 0);
