import test from 'node:test';
import assert from 'node:assert/strict';
import { addManualExpense, createManualExpense, needsAmount, parseAmount } from '../src/manual-expense.js';
import { expenseCategoryMonth } from '../src/expense-cats.js';
import { applyReceiptEdit } from '../src/receipt-edit.js';
import { deleteReceipt, listReceipts, receiptCategory } from '../src/receipts.js';
import { parseAadeSummary } from '../src/receipt.js';

const NOW = '2026-10-26T10:00:00.000Z';

test('manual expense: amount required and > 0, shop optional, date defaults to today', () => {
  assert.throws(() => createManualExpense({ amount: '' }, '2026-10-26'), /μεγαλύτερο από 0/);
  assert.throws(() => createManualExpense({ amount: '0' }, '2026-10-26'), /μεγαλύτερο από 0/);
  assert.throws(() => createManualExpense({ amount: '-3' }, '2026-10-26'), /μεγαλύτερο από 0/);
  assert.throws(() => createManualExpense({ amount: '200000' }, '2026-10-26'), /πολύ μεγάλο/);
  const { receipt, purchase } = createManualExpense({ amount: '23,456', store: '  Κρεοπωλείο   demo ' }, '2026-10-26', NOW);
  assert.equal(receipt.total, 23456); // «23,456» has three decimals → read as thousands
  const e = createManualExpense({ amount: '23,45', store: '  Κρεοπωλείο   demo ' }, '2026-10-26', NOW);
  assert.equal(e.receipt.total, 23.45);
  assert.equal(e.receipt.store, 'Κρεοπωλείο demo');
  assert.equal(e.receipt.date, '2026-10-26');
  assert.equal(e.receipt.format, 'manual');
  assert.deepEqual(e.receipt.items, []);
  assert.equal(e.receipt.lines, 0);
  assert.ok(e.receipt.id.startsWith('manual-'));
  assert.equal(e.purchase.id, `pur-${e.receipt.id}`);
  assert.equal(e.purchase.receiptId, e.receipt.id);
  assert.equal(e.purchase.price, 23.45);
  assert.equal(e.purchase.name, 'Κρεοπωλείο demo');
  assert.equal(e.purchase.storeName, 'Κρεοπωλείο demo');
  assert.equal(purchase.date, '2026-10-26');
  const noShop = createManualExpense({ amount: 5, date: '2026-10-20' }, '2026-10-26', NOW);
  assert.equal(noShop.purchase.name, 'Έξοδο');
  assert.equal(noShop.purchase.storeName, undefined);
  assert.equal(noShop.receipt.date, '2026-10-20');
  assert.equal(createManualExpense({ amount: 5, date: 'nope' }, '2026-10-26').receipt.date, '2026-10-26');
});

test('parseAmount: Greek and dotted decimals', () => {
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('1.234,50'), 1234.5);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('12,50 €'), 12.5);
  assert.ok(Number.isNaN(parseAmount('abc')));
});

test('manual expense counts in the month: «Αγορές» by default, or the chosen category', () => {
  const cats = [{ id: 'ec-meat', name: 'Κρέας', emoji: '🥩', createdAt: '2026-01-01' }];
  let state = { receipts: [], purchases: [{ id: 'p0', price: 10, date: '2026-10-02' }] };
  const a = createManualExpense({ amount: '30', store: 'Σούπερ μάρκετ demo', date: '2026-10-05' }, '2026-10-26', NOW);
  const b = createManualExpense({ amount: '12.40', store: 'Κρεοπωλείο demo', date: '2026-10-06', expenseCategory: 'ec-meat' }, '2026-10-26', NOW);
  state = { ...state, ...addManualExpense(state, a) };
  state = { ...state, ...addManualExpense(state, b) };
  const m = expenseCategoryMonth({ purchases: state.purchases, extras: [], categories: cats }, '2026-10');
  assert.equal(m.shopping, 40);
  assert.equal(m.rows.find((r) => r.id === 'ec-meat').total, 12.4);
  assert.equal(state.receipts.length, 2);
  assert.equal(b.receipt.expenseCategory, 'ec-meat');
  assert.equal(b.purchase.expenseCategory, 'ec-meat');
});

test('older versions: a manual expense behaves like a receipt saved «only the total» (list, edit, delete)', () => {
  const e = createManualExpense({ amount: '18', store: 'Λαϊκή demo', date: '2026-10-24' }, '2026-10-26', NOW);
  let state = { receipts: [e.receipt], purchases: [e.purchase] };
  assert.equal(listReceipts(state.receipts)[0].id, e.receipt.id);
  assert.equal(receiptCategory(e.receipt, state.purchases), 'Αγορές');
  const edited = applyReceiptEdit(state, e.receipt.id, { store: 'Λαϊκή Τρίτης', date: '2026-10-25', total: '21.5' }, NOW);
  assert.equal(edited.receipts[0].total, 21.5);
  assert.equal(edited.purchases[0].price, 21.5);
  assert.equal(edited.purchases[0].date, '2026-10-25');
  assert.equal(edited.purchases[0].name, 'Λαϊκή Τρίτης');
  const gone = deleteReceipt(edited, e.receipt.id);
  assert.deepEqual(gone, { receipts: [], purchases: [] });
});

test('ΑΑΔΕ cash-register QR has no amount → needs the amount (never a 0 € expense)', () => {
  const aade = parseAadeSummary('https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DEMO123');
  assert.equal(aade.total, 0);
  assert.equal(needsAmount(aade), true);
  assert.equal(needsAmount(parseAadeSummary('https://mydatapi.aade.gr/TimologioQR/QRInfo?issuerVat=999999999&issueDate=10/10/2026&mark=400&totalGrossValue=12.30')), false);
  assert.equal(needsAmount({ lines: [{ name: 'x', price: 0 }], total: 0 }), false);
  assert.equal(needsAmount(null), false);
  // Saved with the scan's id/link so the same QR can't be recorded twice.
  const e = createManualExpense({ amount: '7.20', id: 'rcpt-demo', url: 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DEMO123', format: 'AADE' }, '2026-10-26', NOW);
  assert.equal(e.receipt.id, 'rcpt-demo');
  assert.equal(e.receipt.format, 'AADE');
  assert.equal(e.receipt.url, 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=DEMO123');
  assert.equal(e.purchase.id, 'pur-rcpt-demo');
});
