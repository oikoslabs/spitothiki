import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenseCategory, deleteExpenseCategory, expenseCategories, expenseCategoryMonth, effectiveItemCategory, purchaseShares, totalPurchaseCategory, upsertExpenseCategory, NO_CATEGORY } from '../src/expense-cats.js';
import { applyReceiptEdit } from '../src/receipt-edit.js';
import { createExtra, setExtraQty } from '../src/extras.js';
import { DATA_KINDS, loadState, parseBackup, saveState } from '../src/storage.js';

const NOW = '2026-10-24T10:00:00.000Z';
const clothes = createExpenseCategory({ id: 'ec-clothes', name: 'Ρούχα', emoji: '👕' }, [], NOW);
const gifts = createExpenseCategory({ id: 'ec-gifts', name: 'Δώρα' }, [clothes], '2026-10-24T11:00:00.000Z');

test('categories: create, unique name (accents/case), rename keeps id, default emoji, delete', () => {
  assert.deepEqual([clothes.name, clothes.emoji], ['Ρούχα', '👕']);
  assert.equal(gifts.emoji, '🏷️');
  assert.throws(() => createExpenseCategory({ name: 'ρουχα' }, [clothes]), /Υπάρχει ήδη/);
  assert.throws(() => createExpenseCategory({ name: '  ' }, []), /όνομα/);
  const renamed = createExpenseCategory({ id: 'ec-clothes', name: 'Ρούχα & παπούτσια' }, [clothes], NOW);
  assert.equal(renamed.id, 'ec-clothes'); assert.equal(renamed.emoji, '👕');
  const list = upsertExpenseCategory([clothes, gifts], renamed);
  assert.equal(list.length, 2); assert.equal(expenseCategories(list)[0].name, 'Ρούχα & παπούτσια');
  assert.deepEqual(deleteExpenseCategory(list, 'ec-gifts').map((c) => c.id), ['ec-clothes']);
});

test('item category: own choice, «-» = none, empty = same as the receipt', () => {
  assert.equal(effectiveItemCategory('', 'ec-gifts'), 'ec-gifts');
  assert.equal(effectiveItemCategory(NO_CATEGORY, 'ec-gifts'), '');
  assert.equal(effectiveItemCategory('ec-clothes', ''), 'ec-clothes');
});

// Demo receipt: bread + T-shirt, recorded per line (one purchase per item).
const demoState = () => ({
  expenseCategories: [clothes, gifts],
  receipts: [{ id: 'r1', store: 'Demo Market', date: '2026-10-10', total: 16.5, items: [{ name: 'Ψωμί', quantity: 1, price: 1.5 }, { name: 'Μπλουζάκι', quantity: 1, price: 15 }] }],
  purchases: [
    { id: 'pur-r1-0', receiptId: 'r1', name: 'Ψωμί', price: 1.5, date: '2026-10-10', category: 'Ξηρά τρόφιμα' },
    { id: 'pur-r1-1', receiptId: 'r1', name: 'Μπλουζάκι', price: 15, date: '2026-10-10', category: 'Άλλο' },
    { id: 'pur-x', name: 'Γάλα', price: 2, date: '2026-10-11', category: 'Γαλακτοκομικά' }
  ],
  extras: [createExtra({ id: 'e1', category: 'coffee', amount: 3, date: '2026-10-12' }, NOW)]
});

test('receipt edit: per-item category moves only that line; pantry categories untouched', () => {
  const s = demoState();
  const next = applyReceiptEdit(s, 'r1', { store: 'Demo Market', date: '2026-10-10', items: [{ name: 'Ψωμί', quantity: 1, price: 1.5 }, { name: 'Μπλουζάκι', quantity: 1, price: 15, expenseCategory: 'ec-clothes' }] }, NOW);
  const byId = Object.fromEntries(next.purchases.map((p) => [p.id, p]));
  assert.equal(byId['pur-r1-0'].expenseCategory, undefined);
  assert.equal(byId['pur-r1-1'].expenseCategory, 'ec-clothes');
  assert.equal(byId['pur-r1-1'].category, 'Άλλο');
  assert.equal(next.receipts[0].items[1].expenseCategory, 'ec-clothes');
  // Whole receipt as «Δώρα», the bread explicitly back to «Αγορές».
  const again = applyReceiptEdit(next, 'r1', { store: 'Demo Market', date: '2026-10-10', expenseCategory: 'ec-gifts', items: [{ name: 'Ψωμί', quantity: 1, price: 1.5, expenseCategory: NO_CATEGORY }, { name: 'Μπλουζάκι', quantity: 1, price: 15, expenseCategory: '' }] }, NOW);
  const b2 = Object.fromEntries(again.purchases.map((p) => [p.id, p]));
  assert.equal(b2['pur-r1-0'].expenseCategory, undefined);
  assert.equal(b2['pur-r1-1'].expenseCategory, 'ec-gifts');
  assert.equal(again.receipts[0].expenseCategory, 'ec-gifts');
  // An edit that doesn't mention categories keeps them.
  const keep = applyReceiptEdit(again, 'r1', { store: 'Demo Market 2', date: '2026-10-10' }, NOW);
  assert.equal(keep.purchases.find((p) => p.id === 'pur-r1-1').expenseCategory, 'ec-gifts');
});

test('receipt recorded as one total: per-item categories become a split of that purchase', () => {
  assert.deepEqual(totalPurchaseCategory([{ name: 'Ψωμί', price: 1.5 }, { name: 'Μπλουζάκι', price: 15, expenseCategory: 'ec-clothes' }], ''), { expenseSplit: { 'ec-clothes': 15 } });
  assert.deepEqual(totalPurchaseCategory([{ name: 'Μπλουζάκι', price: 15 }], 'ec-clothes'), { expenseCategory: 'ec-clothes' });
  assert.deepEqual(totalPurchaseCategory([], 'ec-gifts'), { expenseCategory: 'ec-gifts' });
  assert.deepEqual(totalPurchaseCategory([], ''), {});
  const s = { receipts: [{ id: 'r2', store: 'Demo', date: '2026-10-05', total: 16.5, items: [{ name: 'Ψωμί', price: 1.5 }, { name: 'Μπλουζάκι', price: 15 }] }], purchases: [{ id: 'pur-r2', receiptId: 'r2', name: 'Demo', price: 16.5, date: '2026-10-05' }] };
  const next = applyReceiptEdit(s, 'r2', { store: 'Demo', date: '2026-10-05', items: [{ name: 'Ψωμί', price: 1.5 }, { name: 'Μπλουζάκι', price: 15, expenseCategory: 'ec-clothes' }] }, NOW);
  assert.deepEqual(next.purchases[0].expenseSplit, { 'ec-clothes': 15 });
  assert.deepEqual(purchaseShares(next.purchases[0], new Set(['ec-clothes'])), [{ category: 'ec-clothes', amount: 15 }, { category: '', amount: 1.5 }]);
});

test('month totals: own categories taken out of Αγορές / Μικροέξοδα, grand total unchanged', () => {
  const s = demoState();
  s.purchases[1].expenseCategory = 'ec-clothes';
  s.purchases.push({ id: 'pur-r9', receiptId: 'r9', price: 20, date: '2026-10-15', expenseSplit: { 'ec-gifts': 8 } });
  s.extras.push(createExtra({ id: 'e2', category: 'coffee', amount: 4, date: '2026-10-13', expenseCategory: 'ec-gifts' }, NOW));
  s.extras.push(createExtra({ id: 'e3', category: 'coffee', amount: 9, date: '2026-09-30', expenseCategory: 'ec-gifts' }, NOW)); // other month
  const m = expenseCategoryMonth({ purchases: s.purchases, extras: s.extras, categories: s.expenseCategories }, '2026-10');
  assert.equal(m.shopping, 1.5 + 2 + 12);
  assert.equal(m.extras, 3);
  assert.deepEqual(m.rows.map((r) => [r.id, r.total]), [['ec-clothes', 15], ['ec-gifts', 12]]);
  const all = m.shopping + m.extras + m.rows.reduce((t, r) => t + r.total, 0);
  assert.equal(Math.round(all * 100) / 100, 1.5 + 15 + 2 + 20 + 3 + 4);
});

test('deleting a category: its expenses fall back to Αγορές / Μικροέξοδα, nothing lost', () => {
  const s = demoState();
  s.purchases[1].expenseCategory = 'ec-clothes';
  s.extras[0] = createExtra({ ...s.extras[0], expenseCategory: 'ec-clothes' }, NOW);
  const cats = deleteExpenseCategory(s.expenseCategories, 'ec-clothes');
  const m = expenseCategoryMonth({ purchases: s.purchases, extras: s.extras, categories: cats }, '2026-10');
  assert.equal(m.shopping, 18.5); assert.equal(m.extras, 3);
  assert.deepEqual(m.rows.map((r) => r.id), ['ec-gifts']);
  // a split that exceeds the price is capped (no double counting)
  assert.deepEqual(purchaseShares({ price: 5, expenseSplit: { a: 9 } }, new Set(['a'])), [{ category: 'a', amount: 5 }]);
});

test('small expenses keep their category through edits and quantity changes', () => {
  const e = createExtra({ category: 'coffee', amount: 2, date: '2026-10-12', expenseCategory: 'ec-gifts' }, NOW);
  assert.equal(e.expenseCategory, 'ec-gifts');
  assert.equal(setExtraQty(e, 3, NOW).expenseCategory, 'ec-gifts');
  assert.equal(createExtra({ ...e, expenseCategory: '' }, NOW).expenseCategory, undefined);
});

test('migration: old saves/backups without categories load unchanged; categories are synced and backed up', () => {
  assert.ok(DATA_KINDS.includes('expenseCategories'));
  const old = { items: [], shopping: [], purchases: [{ id: 'p', price: 4, date: '2026-10-01' }], extras: [{ id: 'x', category: 'coffee', amount: 2, qty: 1, date: '2026-10-02' }] };
  const parsed = parseBackup(JSON.stringify(old));
  assert.deepEqual(parsed.purchases, old.purchases);
  const m = expenseCategoryMonth({ purchases: parsed.purchases, extras: parsed.extras, categories: parsed.expenseCategories }, '2026-10');
  assert.deepEqual([m.shopping, m.extras, m.rows.length], [4, 2, 0]);
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveState({ ...old, expenseCategories: [clothes] }, storage);
  assert.deepEqual(loadState(storage).expenseCategories, [clothes]);
});
