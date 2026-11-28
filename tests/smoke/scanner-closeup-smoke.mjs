// Toll receipts held too close to the camera (SW v170 regression check; synthetic receipt, fictional data only).
// v1.9.48 snapshotted one live frame after 5 s idle, closed the camera and sent the blurry close-up frame to the
// photo OCR → «Δεν βρέθηκαν είδη…» + a failed scan count, even when moving the phone back would read it a second later.
// Checks, with a real ZXing decode on Chrome's fake camera (no BarcodeDetector on Linux):
//   close → far     the camera stays open past 5 s and reads the toll once the receipt is farther away
//   close forever   the camera stays open, «Απομάκρυνε λίγο το κινητό» hint + 📎 photo button, no failed scan queued
// Usage: python3 tests/fixtures/toll/make-toll.py /tmp/toll --y4m && node tests/smoke/scanner-closeup-smoke.mjs <url> /tmp/toll
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:8080/';
const dir = process.argv[3] || '/tmp/toll';
let failed = 0;
async function run(video, seconds) {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${dir}/${video}`] });
  await b.defaultBrowserContext().overridePermissions(new URL(url).origin, ['camera']);
  const p = await b.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (/127\.0\.0\.1|localhost/.test(url)) await p.setBypassServiceWorker(true);
  await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'el-GR' }); });
  await p.setRequestInterception(true);
  p.on('request', (r) => (/cloudflareinsights|-stats\.|\/stats/.test(r.url()) && r.method() === 'POST' ? r.respond({ status: 204, body: '' }) : /cloudflareinsights/.test(r.url()) ? r.abort() : r.continue()));
  await p.goto(url, { waitUntil: 'networkidle0' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.evaluate(() => { location.hash = '#transport'; }); await new Promise((r) => setTimeout(r, 500));
  await p.click('[data-action="transport-receipt"]');
  await p.waitForSelector('[data-action="receipt-scan"]', { visible: true });
  await p.click('[data-action="receipt-scan"]');
  const read = () => p.evaluate(() => ({ open: document.querySelector('#scan-dialog').open, status: document.querySelector('#scan-status').textContent,
    fileRow: !document.querySelector('#scan-file-row').hidden, toll: document.querySelector('#transport-from-receipt') ? document.querySelector('#transport-note').value : '',
    failedScans: JSON.parse(localStorage.getItem('spitothiki:pending-scans') || '[]').filter((e) => !e.success).length }));
  const seen = [];
  for (let i = 0; i < seconds; i++) { await new Promise((r) => setTimeout(r, 1000)); const s = await read(); seen.push(s); if (s.toll) break; }
  await b.close();
  return { seen, errors };
}
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) { failed += 1; console.log(JSON.stringify(info).slice(0, 600)); } };

const a = await run('camera-close-then-far.y4m', 20);
const lastA = a.seen.at(-1);
check('close → far: camera still open at 7 s (no 5 s snapshot that closes it)', a.seen[6]?.open === true || Boolean(a.seen[6]?.toll), a.seen[6]);
check('close → far: toll read once the receipt is farther away', /#1234567/.test(lastA.toll), lastA);
check('close → far: no failed scan counted', lastA.failedScans === 0 && !a.errors.length, { lastA, errors: a.errors });

const c = await run('camera-close.y4m', 16);
const lastC = c.seen.at(-1);
check('close forever: camera still open after 16 s', lastC.open === true, lastC);
check('close forever: «move it back» hint and 📎 photo button', /Απομάκρυνε λίγο το κινητό/.test(lastC.status) && lastC.fileRow, lastC);
check('close forever: no error, no failed scan counted', lastC.failedScans === 0 && !lastC.toll && !c.errors.length, { lastC, errors: c.errors });
process.exit(failed ? 1 : 0);
