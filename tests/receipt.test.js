import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyReceiptUrl, fetchReceipt, guessCategory, parseAadeSummary, parseMyData, parseUbl, receiptId, tidyName } from '../src/receipt.js';
import { setOwnerTestFlag } from '../src/source.js';

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
  assert.ok(via.includes(`https://proxy.test/?url=${encodeURIComponent('https://b.epsilonnet.gr/fd/x/myDATA')}&q=1`));
  await assert.rejects(fetchReceipt('https://b.epsilonnet.gr/fd/x', { fetchImpl: cors }), (e) => e.cors === true);
  await assert.rejects(fetchReceipt('http://b.gr/x'), /https/);
});

test('fetchReceipt: AADE summary is on-device (no proxy) and is marked via=aade', async () => {
  const r = await fetchReceipt('https://www1.aade.gr/tameiakes/timologioqr?issuerVat=094379707&issueDate=2026-11-12&totalGrossValue=10');
  assert.equal(r.format, 'AADE');
  assert.equal(r.via, 'aade');
  assert.equal(r.proxied, false);
});

test('fetchReceipt adds t=1 on the proxy URL only when the stats test flag is on', async () => {
  const via = [];
  const cors = async (url) => {
    via.push(url);
    if (!url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch');
    return { ok: true, text: async () => (url.includes('myDATA') ? myData : ubl) };
  };
  setOwnerTestFlag(true);
  try {
    const p = await fetchReceipt('https://b.epsilonnet.gr/fd/x', { fetchImpl: cors, proxy: 'https://proxy.test/' });
    assert.equal(p.via, 'proxy');
  } finally {
    setOwnerTestFlag(false);
  }
  assert.ok(via.includes(`https://proxy.test/?url=${encodeURIComponent('https://b.epsilonnet.gr/fd/x/myDATA')}&t=1&q=1`));
  via.length = 0;
  await fetchReceipt('https://b.epsilonnet.gr/fd/x', { fetchImpl: cors, proxy: 'https://proxy.test/' });
  assert.ok(via.includes(`https://proxy.test/?url=${encodeURIComponent('https://b.epsilonnet.gr/fd/x/myDATA')}&q=1`));
  assert.equal(via.some((u) => u.includes('t=1')), false);
});

test('parseUbl keeps a distinct legal name as issuerTradeName', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>1</cbc:ID>
  <cbc:IssueDate>2026-11-23</cbc:IssueDate>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΝΕΡΓΕΙΑΚΗ ΑΕ</cbc:Name></cac:PartyName>
    <cac:PartyLegalEntity><cbc:RegistrationName>BP HELLAS</cbc:RegistrationName></cac:PartyLegalEntity>
    <cac:PartyTaxScheme><cbc:CompanyID>EL123456789</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="EUR">40.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity unitCode="LTR">20</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">40</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>ΑΜΟΛΥΒΔΗ 95</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>24</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
  </cac:InvoiceLine>
</Invoice>`;
  const r = parseUbl(xml);
  assert.equal(r.issuerName, 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΝΕΡΓΕΙΑΚΗ ΑΕ');
  assert.equal(r.issuerTradeName, 'BP HELLAS');
});

test('fetchReceipt keeps stripped page text so a franchise brand in the XML can be classified', async () => {
  const my = `<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"><invoice>
    <uid>FUELUID0000000000000000000000000000000001</uid>
    <issuer><vatNumber>123456789</vatNumber></issuer>
    <invoiceHeader><series>1</series><aa>1</aa><issueDate>2026-11-20</issueDate><invoiceType>11.1</invoiceType></invoiceHeader>
    <invoiceDetails><itemDescr>ΑΜΟΛΥΒΔΗ 95</itemDescr><quantity>22</quantity><measurementUnit>1</measurementUnit><netValue>32.26</netValue><vatAmount>7.74</vatAmount></invoiceDetails>
    <invoiceSummary><totalNetValue>32.26</totalNetValue><totalVatAmount>7.74</totalVatAmount><totalGrossValue>40.00</totalGrossValue></invoiceSummary>
  </invoice></InvoicesDoc>`;
  const en = `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>1</cbc:ID>
  <cbc:IssueDate>2026-11-20</cbc:IssueDate>
  <cbc:Note>Πρατήριο BP</cbc:Note>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΝΕΡΓΕΙΑΚΗ ΑΕ</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>EL123456789</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="EUR">40.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity unitCode="LTR">22</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">32.26</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>ΑΜΟΛΥΒΔΗ 95</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>24</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
  </cac:InvoiceLine>
</Invoice>`;
  const ok = (body) => ({ ok: true, status: 200, text: async () => body });
  const r = await fetchReceipt('https://a.epsilonnet.gr/fd/fuel-bp', { fetchImpl: async (url) => ok(url.endsWith('/myDATA') ? my : en) });
  assert.equal(r.issuerName, 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΝΕΡΓΕΙΑΚΗ ΑΕ');
  assert.ok(r.pageText);
  assert.doesNotMatch(r.pageText, /<[^>]+>/);
  assert.match(r.pageText, /BP/);
  assert.match(r.pageText, /ΠΑΠΑΔΟΠΟΥΛΟΣ/);
  assert.match(r.pageText, /ΑΜΟΛΥΒΔΗ/);
  const { classifyStore, receiptClassifyText } = await import('../src/receipt-store.js');
  assert.deepEqual(classifyStore(receiptClassifyText(r), 'a.epsilonnet.gr'), { type: 'fuel', store: 'BP' });
});
