import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteReceipt, listReceipts, receiptCategory, receiptItems, receiptMonths } from '../src/receipts.js';
import { dictionaries } from '../src/i18n.js';

const receipts = [
  { id: 'a', date: '2026-09-28', total: 12.5, store: 'Μάρκετ Α', importedAt: '2026-09-28T10:00:00Z', lines: 2 },
  { id: 'b', date: '2026-10-05', total: 40, store: 'Πρατήριο', format: 'transport', importedAt: '2026-10-05T09:00:00Z' },
  { id: 'c', date: '2026-10-05', total: 8, store: 'Φούρνος', importedAt: '2026-10-05T18:00:00Z', items: [{ name: 'Ψωμί', price: 1.2 }] }
];
const purchases = [{ id: 'p1', receiptId: 'a', name: 'Γάλα', category: 'Γαλακτοκομικά', price: 10 }, { id: 'p2', receiptId: 'a', name: 'Μήλα', category: 'Φρούτα & λαχανικά', price: 2.5 }, { id: 'p3', name: 'άλλο', price: 3 }];

test('receipts: newest first, month filter, months list', () => {
  assert.deepEqual(listReceipts(receipts).map((r) => r.id), ['c', 'b', 'a']);
  assert.deepEqual(listReceipts(receipts, '2026-09').map((r) => r.id), ['a']);
  assert.deepEqual(receiptMonths(receipts), ['2026-10', '2026-09']);
});
test('receipts: category and items (stored or from linked expenses)', () => {
  assert.equal(receiptCategory(receipts[0], purchases), 'Γαλακτοκομικά');
  assert.equal(receiptCategory(receipts[1], purchases), 'Μετακινήσεις');
  assert.equal(receiptCategory(receipts[2], purchases), 'Αγορές');
  assert.deepEqual(receiptItems(receipts[0], purchases).map((i) => i.name), ['Γάλα', 'Μήλα']);
  assert.equal(receiptItems(receipts[2], purchases)[0].name, 'Ψωμί');
});
test('receipts: delete removes the receipt and only its expenses', () => {
  const next = deleteReceipt({ receipts, purchases }, 'a');
  assert.deepEqual(next.receipts.map((r) => r.id), ['b', 'c']);
  assert.deepEqual(next.purchases.map((p) => p.id), ['p3']);
});
test('receipts: English strings', () => {
  for (const k of ['Αποδείξεις', 'Καμία απόδειξη αυτόν τον μήνα.', '{count} αποδείξεις · σύνολο {total}', 'Άνοιγμα ηλεκτρονικής απόδειξης', 'Η απόδειξη διαγράφηκε μαζί με τα έξοδά της.']) assert.ok(dictionaries.en[k], k);
});
