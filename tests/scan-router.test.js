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
  assert.deepEqual(routeCode('hello world 42'), { route: 'unknown', raw: 'hello world 42' });
  assert.equal(routeCode('').route, 'unknown');
});
