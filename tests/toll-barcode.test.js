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

const TODAY = '052026112307404501144092800970000006'; // printed digits from a Nea Attiki Odos receipt scanned 23/11/2026

test('toll barcode: real 36-digit read from 23/11/2026 (Rupaki morning receipt)', () => {
  const r = parseTollBarcode(TODAY);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.prefix, r.id], ['2026-11-23', '07:40:45', '11440928', '05', 'toll:11440928:2026-11-23']);
  assert.equal(TODAY.length, 36);
});

test('toll barcode: the ghost EAN-13 from a partial Code128 read is not a toll', () => {
  assert.equal(parseTollBarcode('7289822868460'), null);
});

// 1.9.48: toll receipt from another station (Dimokratias), amount written as "2,55 €".
import { parseTollText as _ptt, parseTollBarcode as _ptb } from '../src/toll-barcode.js';
import { test as _t } from 'node:test';
import _assert from 'node:assert/strict';
_t('toll OCR: trailing € amount and generic operator for unknown station', () => {
  const r = _ptt('ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΔΗΜΟΚΡΑΤΙΑΣ Α.\n24/11/2026 08:56:22 2118186\nCategory 2\nΑξία με ΦΠΑ 24,00% 2,55 €\nΣΥΝΟΛΟ 2,55 €\nΜΕΤΡΗΤΑ 5,00 €\nΡΕΣΤΑ 2,45 €');
  _assert.equal(r.amount, 2.55);
  _assert.equal(r.operator, 'Διόδια');
  _assert.equal(r.receiptNo, '2118186');
  _assert.equal(_ptb('052026112408562200211818601003700001').date, '2026-11-24');
});
_t('toll OCR: Attiki Odos keeps its name', () => {
  _assert.equal(_ptt('ΑΤΤΙΚΗ ΟΔΟΣ\n14/10/2026 16:33:47 8353391\nΕΥΡΩ 2,55').operator, 'Αττική Οδός');
});


import { readFileSync } from 'node:fs';
import { parseTollDigitsFromText } from '../src/toll-barcode.js';

// Defective-print receipt (Dimokratias, 24/11/2026): the bars do not decode; the printed digits and OCR text do.
const DIMOKRATIAS_DIGITS = '052026112408562200211818601003700001';
const DIMOKRATIAS_TEXT = `ΠΛΗΡΩΜΗΣ ΔΙΟΔΙΩΝ
1 Category 2
ΑΣΙΑ ΜΕ ΦΠΑ  24,00%  ΕΥΡΩ  2,55
ΣΥΝΟΛΟ  ΕΥΡΩ  2,55
ΜΕΤΡΗΤΑ  ΕΥΡΩ  5,00
ΡΕΣΤΑ  ΕΥΡΩ  2,45
ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΔΗΜΟΚΡΑΤΙΑΣ Α.
24/11/2026 08:56:22  2118186  1
ACHW-L01 4057
ΝΟΜΙΜΗ ΑΠΟΔΕΙΞΗ-ΔΙΑΤΗΡΗΣΤΕ ΤΟ ΠΑΡΟΝ
${DIMOKRATIAS_DIGITS}
`;

test('toll barcode: printed 36-digit string from Dimokratias receipt (defective bars)', () => {
  assert.equal(DIMOKRATIAS_DIGITS.length, 36);
  const r = parseTollBarcode(DIMOKRATIAS_DIGITS);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.prefix, r.id], ['2026-11-24', '08:56:22', '2118186', '05', 'toll:2118186:2026-11-24']);
  assert.ok(!('amount' in r) || !r.amount, 'digit format does not encode the amount');
  assert.doesNotMatch(DIMOKRATIAS_DIGITS, /255/);
});

test('toll OCR fallback: digits alone (no Greek keywords) still prefill date, time, receipt', () => {
  const r = parseTollText(DIMOKRATIAS_DIGITS);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.id], ['2026-11-24', '08:56:22', '2118186', 'toll:2118186:2026-11-24']);
  assert.equal(r.amount, 0);
  assert.equal(r.operator, 'Διόδια');
});

test('toll OCR fallback: spaced digits and O/Ο look-alikes', () => {
  const spaced = '0520 261124 085622 002118186 01003700001';
  const ocrO = 'O52O261124O85622OO2118186O1OO37OOOO1';
  assert.equal(parseTollDigitsFromText(spaced).receiptNo, '2118186');
  assert.equal(parseTollDigitsFromText(ocrO).receiptNo, '2118186');
  assert.equal(parseTollText(`junk\n${spaced}\n`).receiptNo, '2118186');
});

test('toll OCR fallback: Dimokratias photo text + digits, amount from ΣΥΝΟΛΟ not from the tail', () => {
  const r = parseTollText(DIMOKRATIAS_TEXT);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.amount, r.operator, r.id], ['2026-11-24', '08:56:22', '2118186', 2.55, 'Διόδια', 'toll:2118186:2026-11-24']);
  // Tail 01003700001 must not be read as 3.70 / 0.01 / 37.00
  assert.equal(r.amount, 2.55);
  assert.equal(parseTollText(DIMOKRATIAS_TEXT.replace(DIMOKRATIAS_DIGITS, '')).amount, 2.55);
});

test('toll OCR fallback: text without digits still works; supermarket text still rejected', () => {
  const textOnly = 'ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΔΗΜΟΚΡΑΤΙΑΣ Α.\n24/11/2026 08:56:22  2118186  1\nΣΥΝΟΛΟ ΕΥΡΩ 2,55';
  const r = parseTollText(textOnly);
  assert.deepEqual([r.date, r.time, r.receiptNo, r.amount, r.operator], ['2026-11-24', '08:56:22', '2118186', 2.55, 'Διόδια']);
  assert.equal(parseTollText('ΣΚΛΑΒΕΝΙΤΗΣ\n24/11/2026 08:56:22 2118186\nΣΥΝΟΛΟ 12,40'), null);
  assert.equal(parseTollDigitsFromText('ΣΚΛΑΒΕΝΙΤΗΣ\n24/11/2026 08:56:22 2118186\nΣΥΝΟΛΟ 12,40'), null);
});

test('receipt photo path uses OCR/digit fallback even when till lines also parse', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const tollText = parseTollText\(result\?\.text\);/);
  assert.match(app, /if \(tollText\) \{ tollToTransport\(tollText, 'photo'\); return; \}/);
  assert.doesNotMatch(app, /tollText && !result\.parsed\.lines\.length/);
});
