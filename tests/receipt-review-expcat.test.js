import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expenseCategoryMonth } from '../src/expense-cats.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('receipt review (lines and total) offers the same «Κατηγορία εξόδου» as the manual form', () => {
  assert.match(app, /function receiptReviewExpCatFields\(/);
  assert.match(app, /id="review-expcat"/);
  assert.match(app, /id="receipt-review-expcat"/);
  assert.match(app, /expCatOptions\(suggested, 'receipt'\)/);
  assert.match(app, /expCatHint\('review-expcat-hint'\)/);
  assert.match(app, /function receiptReviewExpCatFields[\s\S]*?expCatInlineRow\(\)/);
  // lines mode: the select sits under «Κατέγραψε τα έξοδα στο Σύνολο εξόδων»
  assert.match(app, /name="toSpending" checked> <span>Κατέγραψε τα έξοδα στο Σύνολο εξόδων<\/span><\/label>\s*\$\{receiptReviewExpCatFields\(\)\}/);
  // total mode: shown only when the receipt is recorded as an expense, not sent to Μετακινήσεις
  assert.match(app, /const toTransport = receiptState\.target === 'transport' \|\| \['tolls', 'fuel'\]\.includes\(receiptState\.guess\?\.type\);/);
  assert.match(app, /name="mode" value="total">\$\{toTransport \? '' : receiptReviewExpCatFields\(\)\}/);
  // unchecking the spending box hides the select (existing expcat-select handler still opens «＋ Νέα κατηγορία…»)
  assert.match(app, /event\.target\.name === 'toSpending' && event\.target\.form\?\.id === 'receipt-review-form'/);
  assert.match(app, /querySelector\('#receipt-review-expcat'\)/);
  assert.match(app, /box\.hidden = !event\.target\.checked/);
});

test('importReceipt stores the chosen expenseCategory on the receipt and its purchases, and leaves Αγορές as the default', () => {
  const start = app.indexOf('function importReceipt(form)');
  const end = app.indexOf('\nfunction offerScanReminder', start);
  assert.ok(start > 0 && end > start);
  const body = app.slice(start, end);
  assert.match(body, /const sel = form\.elements\.expenseCategory;/);
  assert.match(body, /sel\.value === '__new' \? sel\.dataset\.prev \|\| '' : sel\.value/);
  assert.match(body, /expenseCategory = chosenCat;/);
  assert.match(body, /if \(toSpending\) expenseCategory = chosenCat;/);
  assert.equal([...body.matchAll(/\.\.\.\(expenseCategory \? \{ expenseCategory \} : \{\}\)/g)].length, 3);
  // default empty value means no field, so supermarket receipts still count as Αγορές
  const cats = [{ id: 'ec-oil', name: 'Πετρέλαιο', emoji: '🛢️', createdAt: '2026-11-21T00:00:00.000Z' }];
  const defaultPurchase = { date: '2026-11-21', price: 80, name: 'Γάλα' };
  const ownPurchase = { date: '2026-11-21', price: 120, name: 'Πετρέλαιο θέρμανσης', expenseCategory: 'ec-oil' };
  const month = expenseCategoryMonth({ purchases: [defaultPurchase, ownPurchase], extras: [], categories: cats }, '2026-11');
  assert.equal(month.shopping, 80);
  assert.equal(month.rows[0].total, 120);
  assert.equal(month.rows[0].id, 'ec-oil');
});

test('review and manual forms preselect the remembered store category and show the hint', () => {
  assert.match(app, /function rememberedCatFor\(/);
  assert.match(app, /rememberedExpenseCategory\(state\.receipts \|\| \[\], expCats\(\), \{ issuerVat, store \}\)/);
  assert.match(app, /expCatMemoryHint\('review-expcat-memory', suggested\)/);
  assert.match(app, /expCatMemoryHint\('manual-expcat-memory', suggested\)/);
  assert.match(app, /Προτάθηκε από την προηγούμενη απόδειξη του ίδιου καταστήματος/);
  assert.match(app, /applyExpCatMemory\(document\.querySelector\('#review-expcat'\)/);
  assert.match(app, /applyExpCatMemory\(event\.target\.form\.elements\.expenseCategory/);
});
