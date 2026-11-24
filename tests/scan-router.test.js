import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCode } from '../src/scan-router.js';

test('scan anything: routes receipts, bills, products and unknown values', () => {
  assert.equal(routeCode('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=ABC').route, 'receipt');
  assert.equal(routeCode('https://e-invoicing.example.gr/receipt/123').route, 'receipt');
  const epc = routeCode('BCD\n002\n1\nSCT\n\nΔΕΗ\nGR1601101250000000012300695\nEUR86.40\n\n\nRF18539007547034');
  assert.deepEqual([epc.route, epc.bill.amount], ['bill', 86.4]);
  assert.equal(routeCode('RF18539007547034').route, 'bill');
  const ean = routeCode('5201054002107');
  assert.deepEqual([ean.route, ean.barcode], ['product', '5201054002107']);
  assert.equal(routeCode('(01)09506000134352(17)261231').route, 'product');
  assert.equal(routeCode('https://id.gs1.org/01/09506000134352').route, 'product');
  assert.equal(routeCode('052026101416334700835339100998700009').route, 'toll');
  assert.equal(routeCode('052026112307404501144092800970000006').route, 'toll');
  assert.deepEqual([routeCode('7289822868460').route, routeCode('7289822868460').barcode], ['product', '7289822868460']);
  assert.deepEqual(routeCode('hello world 42'), { route: 'unknown', raw: 'hello world 42' });
  assert.equal(routeCode('').route, 'unknown');
});

import { parseStoreReceiptBarcode } from '../src/scan-router.js';
test('till barcode on a retail receipt (date + till + transaction) is recognised, never as a product or bill', () => {
  // Demo value in the Leroy Merlin / Entersoft layout: 20250315 | 000007 | 123456
  const r = routeCode('20250315000007123456');
  assert.equal(r.route, 'store-receipt');
  assert.equal(r.till.date, '2025-03-15');
  assert.equal(parseStoreReceiptBarcode('20251332000007123456'), null); // no month 13
  assert.equal(parseStoreReceiptBarcode('19990315000007123456'), null); // year out of range
  assert.equal(parseStoreReceiptBarcode('2025031500000'), null); // too short
  assert.equal(routeCode('5201234567890').route, 'product'); // EAN-13 still a product
  assert.equal(routeCode('20251231').route === 'store-receipt', false);
  assert.equal(routeCode('https://e-invoicing.gr/edocuments/ViewInvoice/-1/demo/EN16931').route, 'receipt');
});

test('EYDAP payment barcode routes to a bill, not a shop till receipt', () => {
  const r = routeCode('|2027031510472836|0000036400|10021|42|');
  assert.equal(r.route, 'bill');
  assert.deepEqual([r.bill.kind, r.bill.amount, r.bill.due, r.bill.name], ['eydap', 36.4, '2027-03-15', 'ΕΥΔΑΠ']);
  const compact = routeCode('202703151047283600000364001002142');
  assert.equal(compact.route, 'bill');
  // A failed checksum is not an EYDAP bill (and 33 digits is too long to be a till barcode).
  assert.equal(routeCode('202703151047283600000364011002142').route, 'unknown');
});
