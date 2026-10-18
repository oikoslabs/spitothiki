import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDuplicateBill, findRf, parseBillText } from '../src/bill-pdf.js';

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
