// Diet plan smoke test: scan (real OCR on given photos, or a mocked OCR with the fixture) -> review -> week -> list.
// Usage: node tests/smoke/diet-smoke.mjs <url> [width] [el|en] [screenshotDir] [photo ...]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { parseDietText } from '../../src/diet-plan.js';

const [url = 'http://127.0.0.1:8080/', w = '412', lang = 'el', shots = '', ...photos] = process.argv.slice(2);
const width = Number(w);
const fixture = readFileSync(new URL('../fixtures/diet-plan.txt', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
if (width < 600) { await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'); await page.setViewport({ width, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); } else await page.setViewport({ width, height: 900 });
await page.evaluateOnNewDocument((lang, mock, text) => {
  Object.defineProperty(navigator, 'language', { get: () => (lang === 'en' ? 'en-US' : 'el-GR') });
  if (mock) window.__spitoDietOcrMock = async () => ({ text, confidence: 90 });
}, lang, !photos.length, fixture);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404|cloudflareinsights|CORS|Estimating resolution|Parameter not found|diacritics/.test(m.text())) errors.push(m.text()); });
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:v1', JSON.stringify({ items: [{ id: 'i1', name: 'Αυγά', quantity: 30, unit: 'τεμ.', category: 'Γαλακτοκομικά', location: 'Ψυγείο', expiry: '', minimum: 0, updatedAt: '2026-10-01T00:00:00Z' }], shopping: [] })); });
await page.evaluate(() => { location.hash = '#cook'; });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-action="cook-tab"][data-tab="plan"]');
await page.click('[data-action="cook-tab"][data-tab="plan"]');
await page.waitForSelector('#diet-file');
const input = await page.$('#diet-file');
const files = photos.length ? photos : [new URL('../../icons/icon-192.png', import.meta.url).pathname]; // any image; the mocked OCR returns the fixture
const t0 = Date.now();
await page.evaluate(() => { window.__fileType = null; });
await input.uploadFile(...files);
await page.waitForSelector('#diet-dialog[open] #diet-review', { timeout: 600000 });
const secs = Math.round((Date.now() - t0) / 1000);
const last = await page.evaluate(() => window.__spitoDietLast);
// Accuracy: each expected option counts as captured when an option in the same slot shares >= 80% of its words.
const expected = parseDietText(fixture);
const words = (s) => new Set(String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\d]{2,}/gu) || []);
const sim = (a, b) => { const A = words(a); const B = words(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(1, A.size); };
const report = expected.slots.map((slot, i) => {
  const got = last.parsed.slots.find((s) => s.name === slot.name) || last.parsed.slots[i] || { options: [] };
  const scores = slot.options.map((o) => Math.max(0, ...got.options.map((g) => sim(o.text, g.text))));
  return { slot: slot.name, time: got.time, expectedTime: slot.time, expected: slot.options.length, found: got.options.length, exact80: scores.filter((s) => s >= 0.8).length, partial50: scores.filter((s) => s >= 0.5).length, freqOk: slot.options.filter((o, k) => o.perWeek === (got.options[k]?.perWeek ?? null)).length };
});
console.log(JSON.stringify({ seconds: secs, confidences: last.confidences, slotsFound: last.parsed.slots.map((s) => `${s.name} ${s.time} (${s.options.length})`), report }, null, 1));
if (photos.length) console.log('---OCR TEXT---\n' + last.text);
if (shots) mkdirSync(shots, { recursive: true });
if (shots) await page.screenshot({ path: `${shots}/diet-review-phone.png` });
await page.click('#diet-save');
await page.waitForSelector('#diet-week');
const cells = await page.$$eval('#diet-week .diet-cell.has-meal', (els) => els.length);
if (cells < 7 * 3) fail(`week cells ${cells}`);
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => document.querySelector('#diet-section').scrollIntoView({ behavior: 'instant' }));
await new Promise((r) => setTimeout(r, 300));
if (shots) await page.screenshot({ path: `${shots}/diet-week-phone.png` });
// swap a cell
await page.click('#diet-week .diet-cell');
await page.waitForSelector('#diet-dialog[open] #diet-swap');
await page.click('#diet-swap .meal-option:not(.is-active)');
await page.waitForFunction(() => !document.querySelector('#diet-dialog').open);
await page.click('#diet-to-list');
await page.waitForSelector('#diet-dialog[open] #diet-checklist');
const rows = await page.$$eval('#diet-checklist li', (els) => els.map((e) => [e.textContent.trim(), e.querySelector('input').checked]));
const eggs = rows.find(([s]) => /Αυγά|Eggs/.test(s));
if (!eggs || eggs[1]) fail('eggs in pantry should be unticked');
if (shots) await page.screenshot({ path: `${shots}/diet-to-list-phone.png` });
await page.click('#diet-list-add');
await page.waitForFunction(() => !document.querySelector('#diet-dialog').open);
const added = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).shopping.length);
if (added < 5) fail(`list rows ${added}`);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spitothiki:v1')).dietPlans?.length);
if (saved !== 1) fail('plan not saved');
if (lang === 'en') { const greek = await page.evaluate(async () => (await import('./src/i18n.js')).untranslatedGreek(document.querySelector('#diet-section'))); if (greek.length) fail(`untranslated: ${greek.join(' | ')}`); }
console.log(JSON.stringify({ cells, listRows: rows.length, added, errors }));
if (errors.length) fail(errors.join('\n'));
await browser.close();
