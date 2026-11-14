import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyReceiptUrl, fetchReceipt, guessCategory, parseAadeSummary, parseMyData, parseUbl, receiptId, tidyName } from '../src/receipt.js';

const myData = readFileSync(new URL('./fixtures/receipt-mydata.xml', import.meta.url), 'utf8');
const ubl = readFileSync(new URL('./fixtures/receipt-ubl.xml', import.meta.url), 'utf8');

test('myDATA receipt: lines, units, gross prices, totals', () => {
  const r = parseMyData(myData);
  assert.equal(r.format, 'myDATA');
  assert.equal(r.date, '2026-10-10');
  assert.equal(r.lines.length, 8);
  assert.equal(r.total, 19.87);
  const cheese = r.lines[0];
  assert.equal(cheese.quantity, 0.276);
  assert.equal(cheese.unit, 'κιλά');
  assert.equal(cheese.price, 4.95);
  assert.equal(cheese.category, 'Γαλακτοκομικά');
  assert.equal(r.lines[1].unit, 'τεμ.');
  assert.equal(r.lines[1].category, 'Ξηρά τρόφιμα');
  assert.ok(r.lines.find((l) => /^Αυγα/.test(l.name)));
  assert.equal(Math.round(r.lines.reduce((s, l) => s + l.price, 0) * 100) / 100, r.total);
});

test('EN16931 (UBL) receipt: same lines, supplier name, unit codes', () => {
  const r = parseUbl(ubl);
  assert.equal(r.issuerName, 'ΔΟΚΙΜΑΣΤΙΚΟ ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΕ');
  assert.equal(r.issuerVat, '999999999');
  assert.equal(r.lines.length, 8);
  assert.equal(r.lines[0].unit, 'κιλά');
  assert.equal(r.lines[0].price, 4.97); // 4.40 net + 13%
  assert.equal(r.total, 19.87);
  assert.equal(parseUbl(myData), null);
  assert.equal(parseMyData('<html><body>not xml</body></html>'), null);
});

test('receipt URLs: https only, suffix stripped, AADE summary links', () => {
  assert.deepEqual(classifyReceiptUrl('http://x.gr/fd/1'), { kind: 'insecure' });
  assert.equal(classifyReceiptUrl('nonsense').kind, 'invalid');
  assert.equal(classifyReceiptUrl('https://a.epsilonnet.gr/fd/abc:155/').url, 'https://a.epsilonnet.gr/fd/abc:155');
  assert.equal(classifyReceiptUrl('https://a.epsilonnet.gr/fd/abc:155/myDATA').url, 'https://a.epsilonnet.gr/fd/abc:155');
  assert.equal(classifyReceiptUrl('https://mydatapi.aade.gr/TimologioQR/QRInfo?q=1').kind, 'aade');
  const s = parseAadeSummary('https://mydatapi.aade.gr/TimologioQR/QRInfo?issuerVat=999999999&issueDate=10/10/2026&mark=400&totalGrossValue=12.30');
  assert.equal(s.total, 12.3);
  assert.equal(s.date, '2026-10-10');
  assert.equal(s.lines.length, 0);
});

// Α.1024/2020 ΦΗΜ cash-register QR: official example (serial + mark + SHA-1 + amount).
const FHM_OK = 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=GRT99000204000003870EA2C079E722C361C6297D10F02955CA413695A918.35';
const FHM_50 = 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DMK0000000000000001' + '0123456789ABCDEF0123456789ABCDEF01234567' + '50.00';

test('ΦΗΜ cash-register SIG: amount is the suffix after serial, mark and SHA-1', () => {
  const official = parseAadeSummary(FHM_OK);
  assert.equal(official.total, 18.35);
  assert.equal(official.issuerName, '');
  assert.equal(official.issuerVat, '');
  assert.equal(official.date, '');
  assert.equal(official.lines.length, 0);
  assert.equal(parseAadeSummary(FHM_50).total, 50);
  assert.equal(parseAadeSummary('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DMK00000000000000010123456789ABCDEF0123456789ABCDEF0123456712,50').total, 12.5);
  // Short / invalid SIG (no amount packed in) stays 0 — the app then asks for the amount.
  assert.equal(parseAadeSummary('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DEMO123').total, 0);
  assert.equal(parseAadeSummary('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=NOTAVALIDSIG00000000ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ18.35').total, 0);
  // Query-string totals still win over a SIG, when both are present.
  const both = parseAadeSummary('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=GRT99000204000003870EA2C079E722C361C6297D10F02955CA413695A918.35&totalGrossValue=99.00');
  assert.equal(both.total, 99);
});

test('fetchReceipt: ΦΗΜ SIG amount is parsed on-device (no network)', async () => {
  let calls = 0;
  const r = await fetchReceipt(FHM_OK, { fetchImpl: async () => { calls += 1; throw new Error('should not fetch'); } });
  assert.equal(r.format, 'AADE');
  assert.equal(r.via, 'aade');
  assert.equal(r.proxied, false);
  assert.equal(r.total, 18.35);
  assert.equal(calls, 0);
});

test('name tidy, category guess and stable receipt ids', async () => {
  assert.equal(tidyName('ΑΥΓΑ ΤΣΑΟΥΣΗ ΒΙΟΛΟΓΙΚΑ.'), 'Αυγα τσαουση βιολογικα');
  assert.equal(tidyName('Γάλα'), 'Γάλα');
  assert.equal(guessCategory('ΑΠΟΡΡΥΠΑΝΤΙΚΟ ΠΙΑΤΩΝ'), 'Καθαριότητα');
  assert.equal(guessCategory('ΚΑΦΕΣ ΕΛΛΗΝΙΚΟΣ'), 'Ροφήματα');
  const r = parseMyData(myData);
  assert.equal(await receiptId(r), await receiptId(parseMyData(myData)));
  assert.notEqual(await receiptId(r), await receiptId({ ...r, number: '999' }));
});

test('fetchReceipt: myDATA first, issuer name from EN16931, proxy only on network/CORS failure', async () => {
  const calls = [];
  const ok = (body) => ({ ok: true, status: 200, text: async () => body });
  const direct = async (url) => { calls.push(url); return ok(url.endsWith('/myDATA') ? myData : ubl); };
  const r = await fetchReceipt('https://a.epsilonnet.gr/fd/abc:1/', { fetchImpl: direct });
  assert.deepEqual(calls, ['https://a.epsilonnet.gr/fd/abc:1/myDATA', 'https://a.epsilonnet.gr/fd/abc:1/EN16931']);
  assert.equal(r.format, 'myDATA');
  assert.equal(r.issuerName, 'ΔΟΚΙΜΑΣΤΙΚΟ ΣΟΥΠΕΡΜΑΡΚΕΤ ΑΕ');
  assert.equal(r.via, 'direct');
  assert.equal(r.proxied, false);
  const via = [];
  const cors = async (url) => { via.push(url); if (!url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return ok(url.includes('myDATA') ? myData : ubl); };
  const p = await fetchReceipt('https://b.epsilonnet.gr/fd/x', { fetchImpl: cors, proxy: 'https://proxy.test/' });
  assert.equal(p.lines.length, 8);
  assert.equal(p.via, 'proxy');
  assert.equal(p.proxied, true);
  assert.ok(via.includes(`https://proxy.test/?url=${encodeURIComponent('https://b.epsilonnet.gr/fd/x/myDATA')}`));
  await assert.rejects(fetchReceipt('https://b.epsilonnet.gr/fd/x', { fetchImpl: cors }), (e) => e.cors === true);
  await assert.rejects(fetchReceipt('http://b.gr/x'), /https/);
});

test('fetchReceipt: AADE summary is on-device (no proxy) and is marked via=aade', async () => {
  const r = await fetchReceipt('https://www1.aade.gr/tameiakes/timologioqr?issuerVat=094379707&issueDate=2026-11-12&totalGrossValue=10');
  assert.equal(r.format, 'AADE');
  assert.equal(r.via, 'aade');
  assert.equal(r.proxied, false);
});
