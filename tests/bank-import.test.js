import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyBankImport, matchBankRows, parseAmount, parseBankCsv, parseDate, similarStore, undoBankImport } from '../src/bank-import.js';

test('bank: parses Greek amounts and dates', () => {
  assert.equal(parseAmount('45,80'), 45.8);
  assert.equal(parseAmount('-1.200,15'), -1200.15);
  assert.equal(parseDate('12/11/2026'), '2026-11-12');
  assert.equal(parseDate('2026-11-12'), '2026-11-12');
});

test('bank: similar store matches folded Greek names', () => {
  assert.equal(similarStore('ΑΒ Βασιλόπουλος', 'ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ ΑΕ'), true);
  assert.equal(similarStore('Café Demo', 'CAFE DEMO'), true);
  assert.equal(similarStore('Σκλαβενίτης', 'ΔΕΗ'), false);
});

test('bank: CSV fixture matches receipts by amount, ±2 days and store, ignores salary credit', () => {
  const csv = readFileSync(new URL('./fixtures/bank-sample.csv', import.meta.url), 'utf8');
  const rows = parseBankCsv(csv);
  assert.equal(rows.length, 4);
  const receipts = [{ id: 'r1', date: '2026-11-13', total: 45.8, store: 'ΑΒ Βασιλόπουλος' }];
  const extras = [{ id: 'e1', date: '2026-11-13', amount: 3.5, note: 'Cafe Demo' }];
  const matched = matchBankRows(rows, { receipts, extras, transport: [] });
  const byDesc = Object.fromEntries(matched.map((m) => [m.row.description, m.status]));
  assert.equal(byDesc['ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ ΑΕ'], 'match');
  assert.equal(byDesc['CAFE DEMO'], 'match');
  assert.equal(byDesc['ΜΙΣΘΟΣ ΝΟΕΜΒΡΙΟΥ'], 'ignored');
  assert.equal(byDesc['ΔΕΗ ΔΕΗΔΔ'], 'new');
  const applied = applyBankImport({ receipts, extras, transport: [] }, matched, { now: '2026-11-14T12:00:00.000Z', batchId: 'bk-test' });
  assert.equal(applied.receipts[0].cardPaid, true);
  assert.equal(applied.extras.some((e) => e.source === 'bank' && e.amount === 85), true);
  const undone = undoBankImport(applied, 'bk-test');
  assert.equal(undone.receipts[0].cardPaid, undefined);
  assert.equal((undone.extras || []).some((e) => e.source === 'bank'), false);
});
