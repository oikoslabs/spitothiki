// Two-sided sheet: scan front (mock OCR), then «➕ Πρόσθεσε κι άλλη σελίδα» with the back; checks merge + page count.
// Usage: node tests/smoke/diet-add-page-smoke.mjs <url> [screenshot]
import puppeteer from 'puppeteer-core';
const [url = 'http://127.0.0.1:8080/', shot = ''] = process.argv.slice(2);
const FRONT = 'ΠΡΩΙΝΟ (08:00)\n- 1 φέτα ψωμί με τυρί\n- 1 γιαούρτι με μέλι\nΣΝΑΚ (11:00)\n- 1 μήλο';
const BACK = 'ΣΝΑΚ (11:00)\n- 1 μήλο\n- 10 αμύγδαλα\nΒΡΑΔΙΝΟ (21:00)\n- σαλάτα με τόνο';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((f, b) => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); let n = 0; window.__spitoDietOcrMock = async () => ({ text: n++ ? b : f, confidence: 90 }); }, FRONT, BACK);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); location.hash = '#cook'; });
await page.reload({ waitUntil: 'networkidle0' });
await page.click('[data-action="cook-tab"][data-tab="plan"]');
await page.waitForSelector('#diet-file');
const img = new URL('../../icons/icon-192.png', import.meta.url).pathname;
await (await page.$('#diet-file')).uploadFile(img);
await page.waitForSelector('#diet-dialog[open] #diet-add-page input');
const p1 = await page.$eval('#diet-pages', (e) => e.textContent);
await page.evaluate(() => { document.querySelector('[data-diet-field="person"]').value = 'Test'; document.querySelector('[data-diet-field="person"]').dispatchEvent(new Event('input', { bubbles: true })); });
await (await page.$('#diet-add-page input')).uploadFile(img);
await page.waitForFunction(() => document.querySelector('#diet-pages')?.textContent.startsWith('2'), { timeout: 20000 });
const res = await page.evaluate(() => ({ count: document.querySelector('#diet-count').textContent, pages: document.querySelector('#diet-pages').textContent, person: document.querySelector('#diet-person').value, open: document.querySelector('#diet-dialog').open }));
console.log(JSON.stringify({ p1, ...res, errors }));
const ok = p1.startsWith('1') && res.count.startsWith('3') && /5/.test(res.count) && res.person === 'Test' && res.open && !errors.length;
if (shot) { await page.evaluate(() => document.querySelector('#diet-add-page').scrollIntoView({ block: 'center' })); await new Promise((r) => setTimeout(r, 300)); await page.screenshot({ path: shot }); }
console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1;
await browser.close();
