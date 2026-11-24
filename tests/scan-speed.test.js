// v1.9.39 scan speed: toll barcodes, proxy-first hosts (+ learned), parallel myDATA/EN16931, AADE shop name, one count per scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCAN_REGIONS, SCAN_REGIONS_1D, SCAN_IDLE_FALLBACK_MS, SCAN_IDLE_MS, acceptScanValue, detectorGroups, isStableRead, regionsFor, scanZoom, zxingRegions } from '../src/barcode.js';
import { PROXY_HOSTS_KEY, PROXY_HOSTS_TTL_MS, fetchAadeShop, fetchReceipt, isProxyFirstHost, parseAadeFhmPage, parseAadeSummary, parseMyData, parseUbl, rememberProxyHost, receiptId } from '../src/receipt.js';
import { allowedAadePage, allowedHost } from '../src/receipt-domains.js';
import { parseTollBarcode } from '../src/toll-barcode.js';
import { reportScan, scanTimingFields, sendScanEvent } from '../src/source.js';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const myData = fx('receipt-mydata.xml');
const ubl = fx('receipt-ubl.xml');
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const ok = (body) => ({ ok: true, status: 200, text: async () => body });
const TOLL = ']C0052026101416334700835339100998700009'; // fictional-format copy of the documented test value
const SIG = `TST00000001${'00000042'}${'a'.repeat(40)}18.35`;
const FHM = `https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=${SIG}`;

// The pre-v1.9.39 lookup, kept here as the reference: myDATA, then EN16931, one after the other.
async function legacyFetch(base, fetchText) {
  let receipt = null; let lastError = null; let ubl2 = null;
  try { receipt = parseMyData(await fetchText(`${base}/myDATA`)); } catch (e) { lastError = e; }
  if (!receipt?.lines.length || !receipt.issuerName) { try { ubl2 = parseUbl(await fetchText(`${base}/EN16931`)); } catch (e) { lastError = lastError || e; } }
  if (!receipt?.lines.length && ubl2?.lines.length) receipt = ubl2;
  else if (receipt && ubl2?.issuerName) receipt.issuerName = ubl2.issuerName;
  if (receipt && ubl2 && receipt !== ubl2) { receipt.related = ubl2.related || []; receipt.mark ||= ubl2.mark || ''; }
  return { receipt, lastError };
}

test('scanner: receipts/«all» at 1x zoom, product keeps ~2x; 1D detectors skip the tight centre crop', () => {
  assert.equal(scanZoom('receipt', { zoom: { max: 8 } }), 0);
  assert.equal(scanZoom('all', { zoom: { max: 8 } }), 0);
  assert.equal(scanZoom('product', { zoom: { max: 8 } }), 2);
  assert.equal(scanZoom('product', { zoom: { max: 1.2 } }), 0);
  assert.equal(scanZoom('bill', { zoom: { max: 3 } }), 2);
  assert.deepEqual(regionsFor(['code_128', 'itf']), SCAN_REGIONS_1D);
  assert.deepEqual(regionsFor(['qr_code', 'code_128']), SCAN_REGIONS);
  assert.equal(SCAN_REGIONS_1D.length, 2);
  assert.ok(SCAN_REGIONS_1D.every((r) => r[2] >= 0.8), 'only the wide box and the full frame');
  const native = ['qr_code', 'code_128', 'itf', 'ean_13', 'pdf417'];
  assert.deepEqual(detectorGroups('receipt', native), [['qr_code', 'pdf417'], ['code_128', 'itf', 'ean_13']]);
  assert.deepEqual(detectorGroups('all', native), [['qr_code', 'pdf417'], ['code_128', 'itf', 'ean_13']]);
  assert.deepEqual(detectorGroups('product', native), [native], 'product scanning unchanged: one detector');
  assert.deepEqual(detectorGroups('receipt', ['qr_code']), [['qr_code']]);
  assert.deepEqual(detectorGroups('product', []), []);
});

test('receipt-QR scanner accepts a valid toll barcode on the first read; other 1D codes still need two reads', () => {
  const confident = (v) => Boolean(parseTollBarcode(v));
  assert.equal(isStableRead('receipt', TOLL, '', confident), true);
  assert.equal(isStableRead('receipt', '5201234567890', '', confident), false);
  assert.equal(isStableRead('receipt', '5201234567890', '5201234567890', confident), true);
  assert.equal(isStableRead('receipt', '0520261014', '', confident), false, 'a partial read is not a toll barcode');
  assert.equal(isStableRead('receipt', 'https://e-invoicing.gr/x', '', confident), true);
  assert.equal(isStableRead('receipt', TOLL, ''), true, 'a valid toll is first-read even without the caller\'s confident hook');
  assert.equal(isStableRead('product', '5201234567890', ''), false);
  assert.equal(isStableRead('product', TOLL, ''), true, 'product mode also accepts a toll on the first read');
});

test('proxy-first hosts: e-invoicing.gr skips the failing direct read; proxy unreachable → one direct try', async () => {
  assert.equal(isProxyFirstHost('e-invoicing.gr', { storage: memory() }), true);
  assert.equal(isProxyFirstHost('www.e-invoicing.gr', { storage: memory() }), true);
  assert.equal(isProxyFirstHost('a.epsilonnet.gr', { storage: memory() }), false);
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); if (!url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return ok(url.includes('myDATA') ? myData : ubl); };
  const r = await fetchReceipt('https://e-invoicing.gr/edocuments/x', { fetchImpl, proxy: 'https://proxy.test', storage: memory() });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((u) => u.startsWith('https://proxy.test/?url=') && u.endsWith('&q=1')));
  assert.equal(r.via, 'proxy');
  assert.equal(r.proxied, true);
  const down = []; // proxy can't be reached: the provider is tried directly once per lookup
  const r2 = await fetchReceipt('https://e-invoicing.gr/edocuments/x', { storage: memory(), proxy: 'https://proxy.test', fetchImpl: async (url) => { down.push(url); if (url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return ok(url.includes('myDATA') ? myData : ubl); } });
  assert.equal(r2.lines.length, 8);
  assert.equal(down.filter((u) => u.startsWith('https://e-invoicing.gr')).length, 2);
  // The proxy answered with a status (receipt not published yet): no extra direct read, same «pending» as before.
  const st = [];
  await assert.rejects(fetchReceipt('https://e-invoicing.gr/edocuments/x', { storage: memory(), proxy: 'https://proxy.test', fetchImpl: async (url) => { st.push(url); return { ok: false, status: 400, text: async () => 'Document was not found' }; } }), (e) => e.kind === 'pending');
  assert.ok(st.every((u) => u.startsWith('https://proxy.test')));
});

test('proxy-first learning: a host whose direct read fails (CORS) goes straight to the proxy for 7 days', async () => {
  const storage = memory(); const now = Date.UTC(2026, 10, 21);
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); if (!url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return ok(url.includes('myDATA') ? myData : ubl); };
  await fetchReceipt('https://b.epsilonnet.gr/fd/x', { fetchImpl, proxy: 'https://proxy.test', storage, now });
  assert.equal(calls.filter((u) => !u.startsWith('https://proxy.test')).length, 2, 'first time: direct tried');
  assert.ok(isProxyFirstHost('b.epsilonnet.gr', { storage, now: now + 1000 }));
  assert.ok(JSON.parse(storage.getItem(PROXY_HOSTS_KEY))['b.epsilonnet.gr'] > now);
  calls.length = 0;
  const again = await fetchReceipt('https://b.epsilonnet.gr/fd/y', { fetchImpl, proxy: 'https://proxy.test', storage, now: now + 1000 });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((u) => u.startsWith('https://proxy.test')), 'second time: no direct read');
  assert.equal(again.lines.length, 8);
  assert.equal(isProxyFirstHost('b.epsilonnet.gr', { storage, now: now + PROXY_HOSTS_TTL_MS + 5000 }), false, 'expires');
  // A direct read that works is never remembered; a broken value in storage is ignored.
  const s2 = memory();
  await fetchReceipt('https://c.epsilonnet.gr/fd/x', { fetchImpl: async (url) => ok(url.includes('myDATA') ? myData : ubl), proxy: 'https://proxy.test', storage: s2, now });
  assert.equal(s2.getItem(PROXY_HOSTS_KEY), null);
  s2.setItem(PROXY_HOSTS_KEY, '{oops');
  assert.equal(isProxyFirstHost('c.epsilonnet.gr', { storage: s2, now }), false);
  for (let i = 0; i < 40; i++) rememberProxyHost(`h${i}.epsilonnet.gr`, { storage: s2, now });
  assert.ok(Object.keys(JSON.parse(s2.getItem(PROXY_HOSTS_KEY))).length <= 30, 'capped');
});

test('myDATA and EN16931 are requested together; the receipt is identical to the old one-after-the-other lookup', async () => {
  const started = []; const release = [];
  const fetchImpl = (url) => new Promise((resolve) => { started.push(url); release.push(() => resolve(ok(url.includes('myDATA') ? myData : ubl))); });
  const pending = fetchReceipt('https://a.epsilonnet.gr/fd/abc:1/', { fetchImpl, storage: memory() });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(started, ['https://a.epsilonnet.gr/fd/abc:1/myDATA', 'https://a.epsilonnet.gr/fd/abc:1/EN16931'], 'both in flight before either answers');
  release.reverse().forEach((f) => f());
  const now = await pending;
  const old = (await legacyFetch('https://a.epsilonnet.gr/fd/abc:1', async (u) => (u.endsWith('myDATA') ? myData : ubl))).receipt;
  const { sourceUrl, via, proxied, pageText, ...rest } = now;
  assert.deepEqual(rest, old);
  assert.ok(pageText);
  assert.doesNotMatch(pageText, /<[^>]+>/);
  assert.match(pageText, /ΔΟΚΙΜΑΣΤΙΚΟ ΣΟΥΠΕΡΜΑΡΚΕΤ/);
  assert.equal(await receiptId(now, sourceUrl), await receiptId(old, sourceUrl), 'same id → duplicates still detected');
  // EN16931 failing, myDATA fine: same as before (name stays empty, lines from myDATA).
  const r2 = await fetchReceipt('https://a.epsilonnet.gr/fd/abc:1', { storage: memory(), fetchImpl: async (u) => (u.endsWith('myDATA') ? ok(myData) : { ok: false, status: 500, text: async () => '' }) });
  const o2 = (await legacyFetch('x', async (u) => { if (u.endsWith('myDATA')) return myData; throw Object.assign(new Error('HTTP 500'), { status: 500 }); })).receipt;
  const { sourceUrl: _a, via: _b, proxied: _c, pageText: _p2, ...rest2 } = r2;
  assert.deepEqual(rest2, o2);
  // myDATA failing, EN16931 fine: the UBL receipt, as before.
  const r3 = await fetchReceipt('https://a.epsilonnet.gr/fd/abc:1', { storage: memory(), fetchImpl: async (u) => (u.endsWith('EN16931') ? ok(ubl) : { ok: false, status: 404, text: async () => '' }) });
  assert.equal(r3.format, 'EN16931');
  assert.deepEqual(r3.lines, parseUbl(ubl).lines);
  // Both failing: the myDATA error decides the message, as before.
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/abc:1', { storage: memory(), fetchImpl: async (u) => (u.endsWith('myDATA') ? { ok: false, status: 503, text: async () => '' } : { ok: false, status: 404, text: async () => '' }) }), (e) => e.kind === 'temporary');
  // Unknown provider: still one quiet direct read, never EN16931 or the proxy.
  const un = [];
  await assert.rejects(fetchReceipt('https://shop.example.gr/r/1', { storage: memory(), proxy: 'https://proxy.test', fetchImpl: async (u) => { un.push(u); throw new TypeError('Failed to fetch'); } }), (e) => e.kind === 'unsupported');
  assert.deepEqual(un, ['https://shop.example.gr/r/1/myDATA']);
});

test('AADE cash-register page: shop name and address from a sanitized fixture; empty for an unknown device', () => {
  assert.deepEqual(parseAadeFhmPage(fx('aade-fhm-ok.html')), { issuerName: 'ΔΟΚΙΜΑΣΤΙΚΟ ΚΑΦΕ & ΑΡΤΟΠΟΙΕΙΟ Ο.Ε.', issuerAddress: 'ΟΔΟΣ ΔΟΚΙΜΗΣ 1, 10000 ΑΘΗΝΑ' });
  assert.deepEqual(parseAadeFhmPage(fx('aade-fhm-unknown.html')), { issuerName: '', issuerAddress: '' });
  assert.deepEqual(parseAadeFhmPage('<html>captcha</html>'), { issuerName: '', issuerAddress: '' });
  assert.deepEqual(parseAadeFhmPage(''), { issuerName: '', issuerAddress: '' });
});

test('allowedAadePage: only the public q1.php check with a SIG; aade.gr stays out of the provider list', () => {
  assert.equal(allowedAadePage(FHM), true);
  assert.equal(allowedAadePage(FHM.replace('https:', 'http:')), false);
  assert.equal(allowedAadePage(FHM.replace('www1.aade.gr', 'www.aade.gr')), false);
  assert.equal(allowedAadePage('https://www1.aade.gr/tameiakes/myweb/other.php?SIG=' + SIG), false);
  assert.equal(allowedAadePage('https://www1.aade.gr/tameiakes/myweb/q1.php'), false);
  assert.equal(allowedAadePage('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=short'), false);
  assert.equal(allowedAadePage('https://u:p@www1.aade.gr/tameiakes/myweb/q1.php?SIG=' + SIG), false);
  assert.equal(allowedAadePage('not a url'), false);
  assert.equal(allowedHost('www1.aade.gr'), false);
});

test('AADE: the scan result is exactly as before (instant, no network); fetchAadeShop adds the name via the proxy', async () => {
  const before = { ...parseAadeSummary(FHM), sourceUrl: FHM, via: 'aade', proxied: false };
  let n = 0; const count = async () => { n += 1; return ok(fx('aade-fhm-ok.html')); };
  assert.deepEqual(await fetchReceipt(FHM, { fetchImpl: count, proxy: 'https://proxy.test', storage: memory() }), before);
  assert.equal(n, 0, 'no lookup inside the scan');
  assert.equal(before.total, 18.35);
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); if (!url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return ok(fx('aade-fhm-ok.html')); };
  const shop = await fetchAadeShop(FHM, { fetchImpl, proxy: 'https://proxy.test', storage: memory() });
  assert.deepEqual(calls, [`https://proxy.test/?url=${encodeURIComponent(FHM)}&q=1`], 'straight to the proxy, one request');
  assert.deepEqual(shop, { issuerName: 'ΔΟΚΙΜΑΣΤΙΚΟ ΚΑΦΕ & ΑΡΤΟΠΟΙΕΙΟ Ο.Ε.', issuerAddress: 'ΟΔΟΣ ΔΟΚΙΜΗΣ 1, 10000 ΑΘΗΝΑ' });
  // Adding the name never changes the receipt id (duplicates are still caught).
  assert.equal(await receiptId({ ...before, issuerName: shop.issuerName }, FHM), await receiptId(before, FHM));
  for (const fail of [async () => { throw new TypeError('Failed to fetch'); }, async () => ({ ok: false, status: 503, text: async () => '' }), async () => ok(fx('aade-fhm-unknown.html')), async () => ok('<html>blocked</html>')]) {
    assert.equal(await fetchAadeShop(FHM, { fetchImpl: fail, proxy: 'https://proxy.test', storage: memory() }), null);
  }
  n = 0;
  assert.equal(await fetchAadeShop(FHM, { fetchImpl: count, storage: memory() }), null, 'no proxy configured');
  assert.equal(await fetchAadeShop('https://www1.aade.gr/tameiakes/timologioqr?issuerVat=000000000&totalGrossValue=10', { fetchImpl: count, proxy: 'https://proxy.test' }), null);
  assert.equal(await fetchAadeShop('https://e-invoicing.gr/x', { fetchImpl: count, proxy: 'https://proxy.test' }), null);
  assert.equal(n, 0);
});

test('one anonymous count per scan: toll barcode → toll (no station name, 1.9.48) via barcode; timings are plain numbers only', async () => {
  const calls = [];
  const opts = { storage: memory(), sendScan: (e) => sendScanEvent(e, { fetchImpl: async (u, o) => { calls.push(JSON.parse(o.body)); return { ok: true }; }, online: true, origin: 'https://spitothiki.web.app' }) };
  const toll = parseTollBarcode(TOLL);
  assert.equal(await reportScan({ receipt: { issuerName: toll.operator }, success: true, via: 'barcode', proxied: false, cam: 1450, ms: 1460, torch: 1 }, opts), true);
  assert.deepEqual(calls[0], { type: 'toll', store: '', success: true, via: 'barcode', cam: 1450, ms: 1460, torch: 1 });
  assert.ok(!JSON.stringify(calls[0]).includes(toll.receiptNo), 'no receipt number');
  await reportScan({ receipt: {}, success: true, via: 'aade', proxied: false }, opts);
  assert.deepEqual(calls[1], { type: 'other', store: '', success: true, via: 'aade' });
  assert.deepEqual(scanTimingFields({ cam: -1, ms: 'x', torch: 'yes' }), {});
  assert.deepEqual(scanTimingFields({ cam: 999999, ms: 12.6, torch: false }), { cam: 120000, ms: 13, torch: 0 });
  assert.ok(JSON.stringify({ type: 'supermarket', store: 'x'.repeat(40), success: false, via: 'on-device', cam: 120000, ms: 120000, torch: 1, t: 1 }).length < 200, 'fits the stats worker body limit');
});

test('product accept() keeps a valid toll Code128 and still rejects a non-product 36-digit string', () => {
  assert.equal(acceptScanValue('product', TOLL), true);
  assert.equal(acceptScanValue('product', '052026112408562200211818601003700001'), true);
  assert.equal(acceptScanValue('product', '9'.repeat(36)), false);
  assert.equal(acceptScanValue('product', '5201234567890'), true);
  assert.equal(acceptScanValue('product', ''), false);
  assert.equal(acceptScanValue('receipt', TOLL), true);
  assert.equal(acceptScanValue('all', 'https://e-invoicing.gr/x'), true);
  assert.equal(acceptScanValue('bill', 'RF18539007547034'), true);
});

test('live ZXing in receipt/«all» uses only the wide 1D regions, not the tight centre crop', () => {
  assert.deepEqual(zxingRegions('receipt'), SCAN_REGIONS_1D);
  assert.deepEqual(zxingRegions('all'), SCAN_REGIONS_1D);
  assert.ok(zxingRegions('receipt').every((r) => r[2] >= 0.8));
  assert.notDeepEqual(zxingRegions('product'), SCAN_REGIONS_1D, 'product ZXing still uses the QR centre crop');
  assert.deepEqual(zxingRegions('product'), regionsFor(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'data_matrix', 'qr_code']));
  assert.equal(SCAN_IDLE_FALLBACK_MS, 5000);
  assert.equal(SCAN_IDLE_MS, 8000);
});

test('receipt/«all» scanner: after 5s idle, snapshot the frame and run the photo OCR path; hint mentions a photo', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../src/barcode.js', import.meta.url), 'utf8');
  assert.match(src, /regions: zxingRegions\(mode\)/);
  assert.match(src, /acceptScanValue\(mode, value\)/);
  assert.doesNotMatch(src, /ChecksumError|return_errors:\s*true/);
  const open = app.slice(app.indexOf('async function idleScanFallback'), app.indexOf('function openUniversalScan'));
  assert.match(open, /idleMs: qr === true \|\| qr === 'all' \? SCAN_IDLE_FALLBACK_MS/);
  assert.match(open, /idleScanFallback\(dialog, status, qr\)/);
  assert.match(open, /captureVideoFrame\(/);
  assert.match(open, /loadReceiptPhoto\(file\)/);
  assert.match(app, /βγάλε φωτογραφία την απόδειξη/);
  assert.match(app, /async function idleScanFallback\(/);
});
