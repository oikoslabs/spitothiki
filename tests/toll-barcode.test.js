import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTollBarcode, lastTollAmount, isUrlCode } from '../src/toll-barcode.js';

const SAMPLE = '0520261014163347008353391009987000009';

test('toll barcode: parses the real Rupaki sample', () => {
  const r = parseTollBarcode(SAMPLE);
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.time, '16:33:47');
  assert.equal(r.receiptNo, '8353391');
  assert.equal(r.id, 'toll:05:8353391');
  assert.equal(r.operator, 'Αττική Οδός');
  assert.ok(!SAMPLE.includes('255'), 'amount 2,55 is not in the barcode');
});

test('toll barcode: rejects wrong length, letters, invalid dates/times', () => {
  assert.equal(parseTollBarcode(SAMPLE.slice(1)), null);
  assert.equal(parseTollBarcode(SAMPLE + '1'), null);
  assert.equal(parseTollBarcode(SAMPLE.replace('8353', 'A353')), null);
  assert.equal(parseTollBarcode('05' + '20261314' + SAMPLE.slice(10)), null); // month 13
  assert.equal(parseTollBarcode('05' + '20260230' + SAMPLE.slice(10)), null); // 30 Feb
  assert.equal(parseTollBarcode('05' + '20261014' + '256000' + SAMPLE.slice(16)), null); // hour 25
  assert.equal(parseTollBarcode('5201234567890'), null); // EAN-13
  assert.equal(parseTollBarcode(''), null);
  assert.equal(parseTollBarcode(null), null);
});

test('toll barcode: trims whitespace', () => {
  assert.equal(parseTollBarcode(` ${SAMPLE}\n`).receiptNo, '8353391');
});

test('toll barcode: last amount for same prefix', () => {
  const entries = [
    { type: 'tolls', amount: 2.55, date: '2026-10-10', receiptId: 'toll:05:1' },
    { type: 'tolls', amount: 2.8, date: '2026-10-12', receiptId: 'toll:05:2' },
    { type: 'tolls', amount: 9, date: '2026-10-13', receiptId: 'toll:07:3' },
    { type: 'fuel', amount: 50, date: '2026-10-14', receiptId: 'toll:05:4' }
  ];
  assert.equal(lastTollAmount(entries, '05'), 2.8);
  assert.equal(lastTollAmount(entries, '99'), '');
  assert.ok(isUrlCode('https://x.gr/a') && !isUrlCode(SAMPLE));
});
