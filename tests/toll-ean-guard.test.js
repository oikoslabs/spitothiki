// Guard against a dense Attiki Odos Code128 being accepted as a ghost EAN-13
// (live report, 23/11/2026: printed 052026112307404501144092800970000006,
// the scanner returned 7289822868460 and opened the product flow).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ean13Valid } from '../src/gs1.js';
import { isEanUpcCode, isStableRead, scanFormats } from '../src/barcode.js';
import { parseTollBarcode } from '../src/toll-barcode.js';
import { routeCode } from '../src/scan-router.js';

const TOLL = '052026112307404501144092800970000006';
const GHOST = '7289822868460';
const confAll = (v) => routeCode(v).route !== 'unknown';

test('the reported ghost EAN-13 has a valid checksum and routes as a product, but is not a toll', () => {
  assert.equal(TOLL.length, 36);
  assert.ok(ean13Valid(GHOST));
  assert.equal(isEanUpcCode(GHOST), true);
  assert.equal(isEanUpcCode(TOLL), false);
  assert.equal(parseTollBarcode(GHOST), null);
  assert.ok(parseTollBarcode(TOLL));
  assert.equal(routeCode(GHOST).route, 'product');
  assert.equal(routeCode(TOLL).route, 'toll');
});

test('every scanner mode: a valid toll Code128 is accepted on the first read; a ghost EAN needs two identical reads', () => {
  for (const mode of ['all', 'receipt', 'product', 'bill']) {
    assert.equal(isStableRead(mode, TOLL, '', confAll), true, `${mode}: toll first read`);
    assert.equal(isStableRead(mode, TOLL, '', null), true, `${mode}: toll first read without confident`);
    assert.equal(isStableRead(mode, GHOST, '', confAll), false, `${mode}: ghost EAN not first-read even if routable`);
    assert.equal(isStableRead(mode, GHOST, GHOST, confAll), true, `${mode}: ghost EAN after two identical reads`);
  }
  assert.equal(isStableRead('all', 'https://e-invoicing.gr/x', '', confAll), true, 'QR/link still first-read');
  assert.equal(isStableRead('product', 'https://e-invoicing.gr/x', ''), true, 'a link is first-read in product mode too');
  assert.equal(isStableRead('product', '5201004000014', ''), false);
  assert.equal(isStableRead('product', '4006381333931', '4006381333931'), true);
  assert.equal(isStableRead('all', '0042', '', confAll), false);
});

test('receipt mode no longer enables ean_13; product and «all» still do', () => {
  assert.ok(!scanFormats('receipt').includes('ean_13'));
  assert.ok(scanFormats('product').includes('ean_13'));
  assert.ok(scanFormats('all').includes('ean_13'));
  assert.ok(scanFormats('receipt').includes('code_128'));
  assert.ok(scanFormats('receipt').includes('qr_code'));
});

test('openScanner routes a valid toll to tollToTransport in every mode, before the mode handler', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const open = app.slice(app.indexOf('async function openScanner'), app.indexOf('function openUniversalScan'));
  assert.match(open, /const toll = parseTollBarcode\(code\);/);
  assert.match(open, /if \(toll\) \{ tollToTransport\(toll\); return; \}/);
  assert.ok(open.indexOf('parseTollBarcode(code)') < open.indexOf('onCode(code)'));
  assert.match(app, /function openUniversalScan\(\) \{ openScanner\(\{ qr: 'all', onCode: handleScanned/);
  assert.match(app, /if \(r\.route === 'toll'\) \{ tollToTransport\(r\.toll\); return; \}/);
});
