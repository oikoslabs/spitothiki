import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReceiptText, parseItemLine, normalizeLine } from '../src/receipt-photo.js';

const text = readFileSync(new URL('./fixtures/receipt-photo-ocr.txt', import.meta.url), 'utf8');

test('photo: quantity lines with Greek Χ / Latin x and commas', () => {
  assert.equal(normalizeLine('A 0,308 Χ 16,80 5,17 13'), 'A 0,308 x 16,80 5,17 13');
  const line = parseItemLine('ΧΟΥΡΜΑΔΕΣ ΒΑΣΙΛ. Ιορδ 0,308 Χ 16,80 5,17 13');
  assert.equal(line.name, 'Χουρμαδες βασιλ. ιορδ');
  assert.deepEqual([line.quantity, line.unit, line.price, line.unitPrice, line.vat, line.doubtful], [0.308, 'κιλά', 5.17, 16.8, 13, false]);
  assert.equal(line.category, 'Ξηρά τρόφιμα');
  assert.equal(parseItemLine('ΚΑΣΙΟΥΣ ANAΛATO ΙΝΔ 0,220 X 22,90 5,04 13').name, 'Κασιους αναλατο ινδ');
  const pieces = parseItemLine('ΓΑΛΑ ΦΡΕΣΚΟ 2 x 1,50 3,00 13');
  assert.deepEqual([pieces.quantity, pieces.unit, pieces.price], [2, 'τεμ.', 3]);
});

test('photo: single-item lines, totals and noise are told apart', () => {
  const one = parseItemLine('ΝΕΡΟ ΖΑΓΟΡΙ 1,5L 0,60 13');
  assert.deepEqual([one.quantity, one.price, one.vat], [1, 0.6, 13]);
  assert.equal(parseItemLine('Σύνολο ΦΠΑ: 1,84'), null);
  assert.equal(parseItemLine('Καθ. Αξία: 14,16'), null);
  assert.equal(parseItemLine('ΚΑΤΙ 12,00 55'), null); // 55% is not a VAT rate
});

test('photo: full receipt text -> shop, date, total, flagged doubtful line', () => {
  const r = parseReceiptText(text);
  assert.equal(r.issuerName, 'ΧΑΣΙΩΤΗ');
  assert.equal(r.date, '2026-10-17');
  assert.equal(r.total, 16);
  assert.equal(r.lines.length, 3);
  assert.deepEqual(r.lines.map((l) => l.name), ['Χουρμαδες βασιλ. ιορδ', 'Κασιους αναλατο ινδ', 'Καρυδοψιχα ελληνικη']);
  // 0,254 x 22,80 = 5,79 but OCR read 5,97 -> flagged.
  assert.deepEqual(r.lines.map((l) => l.doubtful), [false, false, true]);
  assert.equal(r.totalMismatch, true);
});
