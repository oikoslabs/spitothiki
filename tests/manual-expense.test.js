import test from 'node:test';
import assert from 'node:assert/strict';
import { addManualExpense, createManualExpense, guessManualCategory, needsAmount, parseAmount } from '../src/manual-expense.js';
import { monthlySpending } from '../src/features.js';
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

test('v1.8.4 manual expense: «Είδος προϊόντος» (was «Τι αγόρασες;») product group, validated, default Άλλο', () => {
  assert.equal(createManualExpense({ amount: '12', store: 'Χασάπης' }, '2026-10-27', NOW).purchase.category, 'Άλλο');
  assert.equal(createManualExpense({ amount: '12', category: 'Κρέας & ψάρι' }, '2026-10-27', NOW).purchase.category, 'Κρέας & ψάρι');
  assert.equal(createManualExpense({ amount: '12', category: 'Γαλακτοκομικά' }, '2026-10-27', NOW).purchase.category, 'Γαλακτοκομικά');
  assert.equal(createManualExpense({ amount: '12', category: 'Ρούχα' }, '2026-10-27', NOW).purchase.category, 'Άλλο');
  assert.equal(createManualExpense({ amount: '12', category: '' }, '2026-10-27', NOW).purchase.category, 'Άλλο');
  const e = createManualExpense({ amount: '12', category: 'Κρέας & ψάρι', expenseCategory: 'ec-1' }, '2026-10-27', NOW);
  assert.equal(e.purchase.expenseCategory, 'ec-1'); // the separate expense category is untouched
  assert.equal(e.receipt.category, undefined);
});

test('v1.8.4 guessManualCategory: from the shop text, accent- and case-insensitive', () => {
  const cases = [
    ['Κρεοπωλείο Παπαδόπουλος', 'Κρέας & ψάρι'], ['ΚΡΕΑΤΑΓΟΡΑ', 'Κρέας & ψάρι'], ['χασάπης', 'Κρέας & ψάρι'], ['Χασαπικο', 'Κρέας & ψάρι'],
    ['Ιχθυοπωλείο', 'Κρέας & ψάρι'], ['ψαράς', 'Κρέας & ψάρι'], ['ΨΑΡΑΔΙΚΟ', 'Κρέας & ψάρι'],
    ['Λαϊκή', 'Φρούτα & λαχανικά'], ['ΛΑΪΚΗ Τρίτης', 'Φρούτα & λαχανικά'], ['λαικη', 'Φρούτα & λαχανικά'], ['Μανάβης', 'Φρούτα & λαχανικά'], ['ΟΠΩΡΟΠΩΛΕΙΟ', 'Φρούτα & λαχανικά'],
    ['Τυριά Κρήτης', 'Γαλακτοκομικά'], ['ΤΥΡΟΚΟΜΕΙΟ', 'Γαλακτοκομικά'], ['Γαλακτοκομικά Νίκος', 'Γαλακτοκομικά'],
    ['Φούρνος', 'Ξηρά τρόφιμα'], ['ΦΟΥΡΝΟΣ', 'Ξηρά τρόφιμα'], ['Αρτοποιείο', 'Ξηρά τρόφιμα'],
    ['Σκλαβενίτης', ''], ['', ''], [null, ''], ['   ', '']
  ];
  for (const [store, want] of cases) assert.equal(guessManualCategory(store), want, String(store));
});

test('v1.8.4 manual expense group shows in the spending bars and survives an edit', () => {
  const e = createManualExpense({ amount: '18,40', store: 'Κρεοπωλείο', category: 'Κρέας & ψάρι' }, '2026-10-27', NOW);
  let state = { ...addManualExpense({ receipts: [], purchases: [] }, e) };
  const bar = (s) => monthlySpending(s.purchases, '2026-10').byCategory;
  assert.deepEqual(bar(state).map((r) => [r.category, r.total]), [['Κρέας & ψάρι', 18.4]]);
  // edit without touching the group keeps it
  state = applyReceiptEdit(state, e.receipt.id, { store: 'Κρεοπωλείο Γ.', date: '2026-10-27', total: '20' }, NOW);
  assert.equal(state.purchases[0].category, 'Κρέας & ψάρι');
  assert.equal(state.purchases[0].price, 20);
  // edit that changes the group
  state = applyReceiptEdit(state, e.receipt.id, { store: 'Λαϊκή', date: '2026-10-27', total: '20', category: 'Φρούτα & λαχανικά' }, NOW);
  assert.equal(state.purchases[0].category, 'Φρούτα & λαχανικά');
  state = applyReceiptEdit(state, e.receipt.id, { store: 'Λαϊκή', date: '2026-10-27', total: '20', category: 'bogus' }, NOW);
  assert.equal(state.purchases[0].category, 'Άλλο');
  // an old manual entry (no group chosen) stays 'Άλλο' after an edit
  const old = createManualExpense({ amount: '5', store: 'Φούρνος' }, '2026-10-27', NOW);
  const s2 = applyReceiptEdit(addManualExpense({ receipts: [], purchases: [] }, old), old.receipt.id, { store: 'Φούρνος', date: '2026-10-27', total: '6' }, NOW);
  assert.equal(s2.purchases[0].category, 'Άλλο');
});

test('v1.8.6 one name per idea: «Είδος προϊόντος» (Γαλακτοκομικά…) vs «Κατηγορία εξόδου» (Αγορές, Ρούχα…)', async () => {
  const { readFileSync } = await import('node:fs');
  const { dictionaries } = await import('../src/i18n.js');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // product groups: same label in add-product dialog, list/recurring form, receipt lines, manual expense, receipt edit
  assert.match(html, /<label class="field-label" for="item-category">Είδος προϊόντος<\/label>/);
  assert.match(app, /aria-label="Είδος προϊόντος"><option value="">Είδος προϊόντος: αυτόματα<\/option>/);
  assert.match(app, /class="field-input receipt-category" name="category" aria-label="Είδος προϊόντος"/);
  assert.match(app, /for="manual-group">\$\{escapeHtml\(t\('Είδος προϊόντος'\)\)\}/);
  assert.match(app, /for="re-group">\$\{escapeHtml\(t\('Είδος προϊόντος'\)\)\}/);
  assert.doesNotMatch(app, /for="(manual|re)-group">\$\{escapeHtml\(t\('Τι αγόρασες;'\)\)\}/);
  assert.doesNotMatch(app, /Κατηγορία: αυτόματα/);
  // expense categories: every picker explains where it ends up
  for (const id of ['manual-expcat-hint', 'extras-expcat-hint']) assert.match(app, new RegExp(`expCatHint\\('${id}'\\)`));
  assert.match(app, /id="re-expcat-hint"/);
  // the product-type bars say they include purchases moved to own categories
  assert.match(app, /t\('Αγορές ανά είδος προϊόντος'\)/);
  assert.match(app, /renderOwnCatNote\(spending\)/);
  for (const key of ['Είδος προϊόντος', 'Είδος προϊόντος: αυτόματα', 'Φίλτρο είδους προϊόντος', 'Αγορές ανά είδος προϊόντος',
    'Σε ποια γραμμή του «Σύνολο εξόδων μήνα» μετράει. Μια δική σου κατηγορία (π.χ. Ρούχα) φαίνεται εκεί σε δική της γραμμή.',
    'Μαζί και {amount} σε δικές σου κατηγορίες εξόδων (π.χ. Ρούχα), που στο «Σύνολο εξόδων μήνα» έχουν δική τους γραμμή.']) assert.ok(dictionaries.en[key], key);
});

test('v1.8.6 a manual expense in an own category: product-type bars keep it, «Σύνολο εξόδων μήνα» moves it to its own line (no data change)', () => {
  const cats = [{ id: 'ec-1', name: 'Ρούχα', emoji: '👕', createdAt: NOW }];
  const e = createManualExpense({ amount: '30', store: 'Zara', category: 'Άλλο', expenseCategory: 'ec-1' }, '2026-10-27', NOW);
  const old = { id: 'pur-old', name: 'Γάλα', category: 'Γαλακτοκομικά', price: 2, date: '2026-10-20' }; // saved before v1.8.6: no expenseCategory
  const purchases = [e.purchase, old];
  const bars = monthlySpending(purchases, '2026-10');
  assert.equal(bars.total, 32);
  assert.deepEqual(bars.byCategory.map((r) => r.category), ['Άλλο', 'Γαλακτοκομικά']);
  const own = expenseCategoryMonth({ purchases, extras: [], categories: cats }, '2026-10');
  assert.equal(own.shopping, 2);
  assert.equal(own.rows[0].total, 30);
  assert.equal(own.shopping + own.rows[0].total, bars.total); // same money, no double counting
});
