import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTollBarcode, parseTollText, tollAmountFromText, lastTollAmount, isUrlCode } from '../src/toll-barcode.js';

const REAL = '052026101416334700835339100998700009'; // decoded from the real receipt photo (36 digits, Code128)

test('toll barcode: real 36-digit read', () => {
  const r = parseTollBarcode(REAL);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.prefix, r.id], ['2026-10-14', '16:33:47', '8353391', '05', 'toll:8353391:2026-10-14']);
  assert.ok(!REAL.includes('255'));
});

test('toll barcode: lenient to symbology ids, spaces, extra/missing digits', () => {
  for (const v of [`]C0${REAL}`, ` ${REAL}\n`, REAL.replace(/(\d{6})/g, '$1 '), REAL + '0', '0' + REAL, REAL.slice(0, 35), '0520261014163347008353391009987000009'])
    assert.equal(parseTollBarcode(v)?.receiptNo, '8353391', v);
});

test('toll barcode: rejects EAN-13, short/long codes, invalid timestamps', () => {
  assert.equal(parseTollBarcode('5201054017739'), null);
  assert.equal(parseTollBarcode('4006381333931'), null);
  assert.equal(parseTollBarcode(REAL.slice(0, 30)), null);
  assert.equal(parseTollBarcode(REAL + '00000'), null);
  assert.equal(parseTollBarcode('9'.repeat(36)), null);
  assert.equal(parseTollBarcode('05' + '20261314' + REAL.slice(10)), null);
  assert.equal(parseTollBarcode('05' + '20190101' + REAL.slice(10)), null);
  assert.equal(parseTollBarcode(''), null);
  assert.equal(parseTollBarcode(null), null);
});

// Actual Tesseract output for the real photo (garbled Greek).
const OCR = 'NEA ΑΤΤΙΚΗ ΟΛΟΣ\nANOCAET EN ΠΛΗΡΩΜΗΣΙ ATO0ALGH\n1 Catagory 2\nΑΤΙΑ NE ΦΠΑ 24,00 ΕΥΡΩ 2,98\nCYROAO ΕΥΡΩ 2, 55\nΜΕΤΡΗΤΑ ΕΥΡΩ 2,558\nΞΤΑΘΙΗΟΣ ATOAION ΡΟΥΠΑΚΙ\n14/10/2026 16:33:47 8353391 1\nROU~-LO4 4451\n';

test('toll text: amount and receipt from real OCR text', () => {
  assert.equal(tollAmountFromText(OCR), 2.55);
  const r = parseTollText(OCR);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.amount, r.id], ['2026-10-14', '16:33:47', '8353391', 2.55, 'toll:8353391:2026-10-14']);
  assert.equal(parseTollText('ΣΚΛΑΒΕΝΙΤΗΣ\n14/10/2026 16:33:47 8353391\nΣΥΝΟΛΟ 12,40'), null);
});

test('toll: last amount and url check', () => {
  const entries = [{ type: 'tolls', amount: 2.55, date: '2026-10-10', receiptId: 'toll:1:2026-10-10' }, { type: 'tolls', amount: 2.8, date: '2026-10-12', receiptId: 'toll:2:2026-10-12' }, { type: 'tolls', amount: 9, date: '2026-10-13' }];
  assert.equal(lastTollAmount(entries), 2.8);
  assert.equal(lastTollAmount([]), '');
  assert.ok(isUrlCode('https://x.gr/a') && !isUrlCode(REAL));
});
