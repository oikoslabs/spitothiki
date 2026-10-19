import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDates, findDuplicateBill, findRf, itemsToLines, mergeBill, parseBillText } from '../src/bill-pdf.js';

const fx = (name) => readFileSync(new URL(`./fixtures/bills/${name}`, import.meta.url), 'utf8');

test('bill text: ΔΕΗ layout (amount on next line, RF with spaces, period)', () => {
  const b = parseBillText(fx('dei.txt'));
  assert.deepEqual([b.name, b.type, b.amount, b.due, b.reference, b.rfValid], ['ΔΕΗ', 'electricity', 86.4, '2026-10-29', 'RF18539007547034', true]);
  assert.deepEqual(b.period, { from: '2026-08-05', to: '2026-10-06' });
});

test('bill text: ΕΥΔΑΠ layout (thousands, dotted short dates, no RF)', () => {
  const b = parseBillText(fx('eydap.txt'));
  assert.deepEqual([b.name, b.type, b.amount, b.due, b.reference], ['ΕΥΔΑΠ', 'water', 1031.4, '2026-11-15', '']);
  assert.deepEqual(b.period, { from: '2026-06-01', to: '2026-09-30' });
});

test('bill text: Cosmote layout (dot decimals, invalid RF flagged)', () => {
  const b = parseBillText(fx('cosmote.txt'));
  assert.deepEqual([b.name, b.type, b.amount, b.due, b.rfValid], ['Cosmote', 'phone', 32.9, '2026-10-20', false]);
  assert.equal(b.reference, 'RF19539007547034');
});

test('bill text: unknown text gives empty fields, RF finder, duplicates', () => {
  const b = parseBillText('Κάτι άσχετο 12/13/2026');
  assert.deepEqual([b.name, b.amount, b.due], ['', null, '']);
  assert.equal(findRf('xx RF 18 5390 0754 7034 yy').reference, 'RF18539007547034');
  const bills = [{ name: 'ΔΕΗ', amount: 86.4, due: '2026-10-29', reference: 'RF18539007547034' }];
  assert.ok(findDuplicateBill(bills, { name: 'ΔΕΗ', amount: 86.4, due: '2026-10-29', reference: 'RF18539007547034' }));
  assert.ok(findDuplicateBill([{ name: 'Νερό', amount: 20, due: '2026-11-01', reference: '' }], { name: 'νερό', amount: 20, due: '2026-11-01', reference: '' }));
  assert.equal(findDuplicateBill(bills, { name: 'ΔΕΗ', amount: 90, due: '2026-12-29', reference: '' }), null);
});

test('bill text: header row + value row in columns picks due (not issue) date and the amount column', () => {
  const b = parseBillText(fx('vodafone-columns.txt'));
  assert.deepEqual([b.name, b.amount, b.due, b.reference, b.rfValid], ['Vodafone', 32.45, '2026-11-05', 'RF18539007547034', true]);
  assert.deepEqual(b.period, { from: '2026-09-01', to: '2026-09-30' });
});

test('bill text: same layout single-spaced (OCR) still aligns header ↔ value by position', () => {
  const b = parseBillText('VODAFONE\nΗμερομηνία έκδοσης Ημερομηνία λήξης Ποσό πληρωμής\n05/10/2026 05/11/2026 32,45 €\nRF18539007547034');
  assert.deepEqual([b.amount, b.due], [32.45, '2026-11-05']);
});

test('bill text: labels and values split over lines by pdf.js; subtotals and previous balance ignored', () => {
  const b = parseBillText(fx('nova-split.txt'));
  assert.deepEqual([b.name, b.amount, b.due], ['Nova', 49.6, '2026-11-05']);
});

test('bill text: «Σύνολο προς πληρωμή» beats «χωρίς ΦΠΑ», Greek month names', () => {
  const b = parseBillText(fx('cosmote-words.txt'));
  assert.deepEqual([b.name, b.amount, b.due], ['Cosmote', 32.45, '2026-11-05']);
});

test('bill text: any provider with RF (insurance) — net premium/contract end ignored, dd-mm-yy', () => {
  const b = parseBillText(fx('insurance.txt'));
  assert.deepEqual([b.name, b.amount, b.due, b.rfValid], ['', 1245.8, '2026-11-05', true]);
});

test('bill text: amounts never come from dates; no labels → empty (never guessed)', () => {
  const b = parseBillText('Πληρωτέο έως 05.11.2026\nRF18539007547034');
  assert.deepEqual([b.amount, b.due], [null, '2026-11-05']);
  const none = parseBillText('Λογαριασμός\n32,45 €\n05/11/2026\nRF18539007547034');
  assert.deepEqual([none.amount, none.due], [null, '']);
  assert.deepEqual(findDates('5 Νοεμβρίου 2026, 1 Μαΐου 2027, 3 Dec 2026').map((d) => d.iso), ['2026-11-05', '2027-05-01', '2026-12-03']);
});

test('mergeBill: EPC QR amount wins over text; OCR only fills missing fields; sources reported', () => {
  const text = parseBillText('VODAFONE\nRF18539007547034\nΠοσό πληρωμής 30,00 €');
  const epc = 'BCD\n002\n1\nSCT\n\nVodafone\nGR1601101250000000012300695\nEUR32.45\n\n\nRF18539007547034';
  const m = mergeBill(text, [parseBillText('Λήξη προθεσμίας 05/11/2026 Ποσό πληρωμής 99,00')], [epc]);
  assert.deepEqual([m.amount, m.due, m.reference], [32.45, '2026-11-05', 'RF18539007547034']);
  assert.deepEqual(m.sources, { name: 'text', amount: 'code', due: 'ocr', reference: 'text' });
  const plainOnly = mergeBill(parseBillText('NOVA'), [], ['RF18539007547034']);
  assert.deepEqual([plainOnly.amount, plainOnly.due, plainOnly.reference, plainOnly.sources.reference], [null, '', 'RF18539007547034', 'code']);
});

test('itemsToLines: items a point apart share a row; wide gaps become column cells', () => {
  const it = (s, x, y, w = 40) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
  const lines = itemsToLines([it('Ποσό', 10, 700), it('πληρωμής', 60, 701.4, 60), it('32,45 €', 300, 699), it('Λήξη', 10, 680), it('05/11/2026', 300, 681)]);
  assert.deepEqual(lines, ['Ποσό πληρωμής   32,45 €', 'Λήξη   05/11/2026']);
  const b = parseBillText(lines.join('\n'));
  assert.deepEqual([b.amount, b.due], [32.45, '2026-11-05']);
});

test('bill text: Vodafone Business (labels drawn as graphics) → amount/due from the RF payment block', () => {
  const fxj = JSON.parse(fx('vodafone-business-items.json'));
  const b = parseBillText(itemsToLines(fxj.items).join('\n'));
  // «Συνολική Οφειλή Πελάτη» 62,93 (printed twice), not this line's 35,01 or the 28,23 net; «Προθεσμία εξόφλησης έως» 28/10.
  assert.deepEqual([b.name, b.amount, b.due, b.reference, b.rfValid], ['Vodafone', 62.93, '2026-10-28', fxj.rf, true]);
  assert.deepEqual(b.period, { from: '2026-10-01', to: '2026-10-31' });
});

test('bill text: RF block fallback never guesses (single amount, two dates, earlier date)', () => {
  const rf = 'RF18539007547034';
  assert.deepEqual(((b) => [b.amount, b.due])(parseBillText(`X\n13/10/2026\n${rf}\n62,93 €\n28/10/2026`)), [null, '2026-10-28']);
  assert.deepEqual(((b) => [b.amount, b.due])(parseBillText(`X\n${rf}\n10,00 €\n10,00 €\n20,00 €\n20,00 €\n28/10/2026\n30/10/2026`)), [null, '']);
  assert.deepEqual(((b) => [b.amount, b.due])(parseBillText(`X\n${rf}\n5,00 €\n5,00 €\n01/10/2026\nπαλιό\n\n\n\n\n\n\n\n\n15/10/2026`)), [5, '']);
  // labels still win over the block
  assert.deepEqual(((b) => [b.amount, b.due])(parseBillText(`Ποσό πληρωμής 40,00 €\nΛήξη 30/10/2026\n${rf}\n62,93 €\n62,93 €\n28/10/2026`)), [40, '2026-10-30']);
});
