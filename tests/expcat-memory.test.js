import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberedExpenseCategory } from '../src/expense-cats.js';

const oil = { id: 'ec-oil', name: 'Πετρέλαιο', emoji: '🛢️', createdAt: '2026-11-21T00:00:00.000Z' };
const clothes = { id: 'ec-clothes', name: 'Ρούχα', emoji: '👕', createdAt: '2026-11-20T00:00:00.000Z' };
const cats = [oil, clothes];
const rec = (over = {}) => ({ id: 'r1', store: 'Shell', issuerVat: '123456789', expenseCategory: 'ec-oil', importedAt: '2026-11-21T10:00:00.000Z', date: '2026-11-21', ...over });

test('VAT match prefers the most recent receipt whose category still exists', () => {
  const receipts = [
    rec({ id: 'old', importedAt: '2026-11-01T10:00:00.000Z', expenseCategory: 'ec-clothes' }),
    rec({ id: 'new', importedAt: '2026-11-20T10:00:00.000Z', expenseCategory: 'ec-oil' })
  ];
  assert.equal(rememberedExpenseCategory(receipts, cats, { issuerVat: '123456789', store: 'Other' }), 'ec-oil');
});

test('same issuerVat wins over a more recent receipt that only shares the shop name', () => {
  const receipts = [
    rec({ id: 'vat', importedAt: '2026-11-01T10:00:00.000Z', expenseCategory: 'ec-oil' }),
    rec({ id: 'name', issuerVat: '999999999', store: 'Πρατήριο', importedAt: '2026-11-22T10:00:00.000Z', expenseCategory: 'ec-clothes' })
  ];
  assert.equal(rememberedExpenseCategory(receipts, cats, { issuerVat: '123456789', store: 'Πρατήριο' }), 'ec-oil');
});

test('falls back to a normalised shop name when VAT is missing or does not match', () => {
  const receipts = [rec({ issuerVat: '', store: '  ΠΡΑΤΗΡΙΟ ΚΑΥΣΙΜΩΝ  ' })];
  assert.equal(rememberedExpenseCategory(receipts, cats, { issuerVat: '', store: 'πρατήριο καυσίμων' }), 'ec-oil');
  assert.equal(rememberedExpenseCategory(receipts, cats, { issuerVat: '000000000', store: 'Πρατήριο Καυσίμων' }), 'ec-oil');
});

test('empty VAT or empty shop name does not match other blanks; default is empty (Αγορές)', () => {
  const blanks = [rec({ issuerVat: '', store: '', expenseCategory: 'ec-oil' })];
  assert.equal(rememberedExpenseCategory(blanks, cats, { issuerVat: '', store: '' }), '');
  assert.equal(rememberedExpenseCategory([], cats, { issuerVat: '123456789', store: 'Shell' }), '');
  assert.equal(rememberedExpenseCategory([rec({ expenseCategory: undefined })], cats, { issuerVat: '123456789', store: 'Shell' }), '');
  assert.equal(rememberedExpenseCategory(null, cats, { issuerVat: '123456789' }), '');
});

test('skips a deleted category and transport receipts, then uses the next valid match', () => {
  const receipts = [
    rec({ id: 'gone', importedAt: '2026-11-22T10:00:00.000Z', expenseCategory: 'ec-deleted' }),
    rec({ id: 'fuel', importedAt: '2026-11-21T12:00:00.000Z', expenseCategory: 'ec-oil', format: 'transport' }),
    rec({ id: 'ok', importedAt: '2026-11-20T10:00:00.000Z', expenseCategory: 'ec-clothes' })
  ];
  assert.equal(rememberedExpenseCategory(receipts, cats, { issuerVat: '123456789', store: 'Shell' }), 'ec-clothes');
});

test('leading EL on the VAT is ignored, and shop names match without accents or case', () => {
  assert.equal(rememberedExpenseCategory([rec({ issuerVat: 'EL123456789' })], cats, { issuerVat: '123456789', store: '' }), 'ec-oil');
  assert.equal(rememberedExpenseCategory([rec({ issuerVat: '123456789' })], cats, { issuerVat: 'el123456789', store: '' }), 'ec-oil');
  const byName = [rec({ issuerVat: '', store: 'ΑΒ Βασιλόπουλος' })];
  assert.equal(rememberedExpenseCategory(byName, cats, { issuerVat: '', store: 'αβ βασιλοπουλος' }), 'ec-oil');
});
