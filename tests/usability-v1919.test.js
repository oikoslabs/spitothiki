import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyReceiptEdit, receiptEditError } from '../src/receipt-edit.js';
import { BAR_OPTIONS, DEFAULT_BAR, parseBar, toggleBar } from '../src/bar.js';
import { dictionaries } from '../src/i18n.js';
const NOW = '2026-11-08T10:00:00.000Z';
const manual = () => ({ receipts: [{ id: 'm1', store: 'Λαϊκή', date: '2026-11-01', total: 15, format: 'manual', items: [] }], purchases: [{ id: 'pur-m1', receiptId: 'm1', name: 'Λαϊκή', price: 15, date: '2026-11-01', category: 'Άλλο' }] });

test('v1.9.19 edit: negative, text, empty, NaN/Infinity total is rejected and the saved €15 stays', () => {
  for (const total of ['-15', '-0,01', 'abc', '', '   ', 'NaN', 'Infinity', '1e999']) {
    const s = manual();
    assert.ok(receiptEditError({ store: 'Λαϊκή', date: '2026-11-01', total }), `should reject ${total}`);
    const next = applyReceiptEdit(s, 'm1', { store: 'Λαϊκή', date: '2026-11-01', total }, NOW);
    assert.equal(next, s);
    assert.equal(next.receipts[0].total, 15); assert.equal(next.purchases[0].price, 15);
  }
  assert.match(receiptEditError({ total: '-15' }), /αρνητικό/);
  for (const k of ['Γράψε το ποσό, π.χ. 12,50.', 'Γράψε ένα έγκυρο ποσό, π.χ. 12,50.', 'Το ποσό δεν μπορεί να είναι αρνητικό.', 'Η τιμή δεν μπορεί να είναι αρνητική.', 'Έλεγξε τις τιμές: γράψε ποσό, π.χ. 2,50.']) assert.ok(dictionaries.en[k], k);
});
test('v1.9.19 edit: Greek decimals are accepted (12,50 and 1.234,50), 0 is allowed', () => {
  assert.equal(applyReceiptEdit(manual(), 'm1', { store: 'Λαϊκή', date: '2026-11-01', total: '12,50' }, NOW).receipts[0].total, 12.5);
  const big = applyReceiptEdit(manual(), 'm1', { store: 'Λαϊκή', date: '2026-11-01', total: '1.234,50' }, NOW);
  assert.equal(big.receipts[0].total, 1234.5); assert.equal(big.purchases[0].price, 1234.5);
  assert.equal(applyReceiptEdit(manual(), 'm1', { store: 'Λαϊκή', date: '2026-11-01', total: '20.5' }, NOW).receipts[0].total, 20.5);
  assert.equal(receiptEditError({ total: '0' }), '');
});
test('v1.9.19 edit: a negative or text line price is rejected; Greek line prices work', () => {
  const s = { receipts: [{ id: 'r1', store: 'S', date: '2026-11-01', total: 3, items: [{ name: 'Ψωμί', quantity: 1, price: 1 }, { name: 'Γάλα', quantity: 1, price: 2 }] }], purchases: [] };
  assert.equal(applyReceiptEdit(s, 'r1', { store: 'S', date: '2026-11-01', items: [{ name: 'Ψωμί', price: '-1' }, { name: 'Γάλα', price: '2' }] }, NOW), s);
  assert.equal(applyReceiptEdit(s, 'r1', { store: 'S', date: '2026-11-01', items: [{ name: 'Ψωμί', price: 'x' }, { name: 'Γάλα', price: '2' }] }, NOW), s);
  assert.equal(applyReceiptEdit(s, 'r1', { store: 'S', date: '2026-11-01', items: [{ name: 'Ψωμί', price: '1,25' }, { name: '', price: 0 }] }, NOW).receipts[0].total, 1.25);
});
test('v1.9.19 edit form: shows the error inline instead of saving', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const save = app.slice(app.indexOf('function saveReceiptEdit'), app.indexOf('// ---------- v1.4: offline bar'));
  assert.ok(save.indexOf('receiptEditError') < save.indexOf('applyReceiptEdit'));
  assert.match(app, /id="receipt-edit-error" role="alert" hidden/);
  assert.match(app, /id="re-total" name="total" type="text" inputmode="decimal"/);
});
test('v1.9.19 manual expense: on the home quick actions and available for the bottom bar; saved bars untouched', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /renderQuickActions\(\['scan', 'manual',|\{ id: 'manual', icon: '✍️', label: 'Έξοδο με το χέρι', hint: 'Χωρίς απόδειξη' \}/); // friendly home: primary action
  assert.ok(BAR_OPTIONS.some((o) => o.id === 'manual'));
  assert.ok(dictionaries.en['Με το χέρι']);
  assert.deepEqual(DEFAULT_BAR, ['scan', 'list', 'extra', 'transport', 'all']);
  const mine = JSON.stringify(['view:bills', 'scan', 'cook']);
  assert.deepEqual(parseBar(mine), ['view:bills', 'scan', 'cook']);
  assert.deepEqual(toggleBar(parseBar(mine), 'manual'), ['view:bills', 'scan', 'cook', 'manual']);
});
test('v1.9.19 onboarding: no promise that every QR gives products or needs no typing', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const card = app.slice(app.indexOf('function renderStarterCard'), app.indexOf('function storageBadge'));
  assert.doesNotMatch(card, /Χωρίς να γράφεις τίποτα|δύο δευτερόλεπτα/);
  assert.match(card, /υποστηριζόμενες ηλεκτρονικές αποδείξεις/);
  assert.match(card, /ΑΑΔΕ/);
  for (const m of card.matchAll(/t\('([^']+)'\)/g)) if (m[1] !== 'Σκανάρεις το QR της απόδειξης.') assert.ok(dictionaries.en[m[1]] || m[1].length < 3, `EN missing: ${m[1]}`);
  assert.ok(dictionaries.en['Σκανάρεις το QR της απόδειξης.']);
});
