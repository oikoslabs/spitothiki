import test from 'node:test';
import assert from 'node:assert/strict';
import { createPantryItem, createShoppingItem, expiryStatus, pantrySummary, toggleShoppingItem } from '../src/domain.js';

test('creates a normalized pantry item with stable defaults', () => {
  const item = createPantryItem({
    id: 'item-1', name: '  Ρύζι  ', quantity: '2', unit: 'πακέτα', category: 'Ξηρά τρόφιμα'
  }, '2026-10-17T12:00:00.000Z');
  assert.deepEqual(item, {
    id: 'item-1', name: 'Ρύζι', quantity: 2, unit: 'πακέτα', minimum: 0,
    category: 'Ξηρά τρόφιμα', expiry: '', location: '',
    createdAt: '2026-10-17T12:00:00.000Z', updatedAt: '2026-10-17T12:00:00.000Z'
  });
});

test('requires a non-empty name and non-negative finite quantity', () => {
  assert.throws(() => createPantryItem({ name: '  ', quantity: 1 }), /όνομα/i);
  assert.throws(() => createPantryItem({ name: 'Γάλα', quantity: -1 }), /ποσότητα/i);
  assert.throws(() => createPantryItem({ name: 'Γάλα', quantity: 'abc' }), /ποσότητα/i);
});

test('classifies expiry dates against a date-only reference without timezone drift', () => {
  assert.equal(expiryStatus('2026-10-16', '2026-10-17'), 'expired');
  assert.equal(expiryStatus('2026-10-24', '2026-10-17'), 'soon');
  assert.equal(expiryStatus('2026-10-25', '2026-10-17'), 'fresh');
  assert.equal(expiryStatus('', '2026-10-17'), 'none');
});

test('summarizes expiry and low-stock items', () => {
  const items = [
    { quantity: 1, minimum: 2, expiry: '2026-10-20' },
    { quantity: 4, minimum: 1, expiry: '2026-10-30' },
    { quantity: 0, minimum: 0, expiry: '2026-10-16' }
  ];
  assert.deepEqual(pantrySummary(items, '2026-10-17'), {
    products: 3, expiringSoon: 1, expired: 1, lowStock: 1
  });
});

test('creates a shopping-list item as unchecked', () => {
  const item = createShoppingItem({ id: 'shop-1', name: 'Καφές', quantity: 2, unit: 'πακέτα' }, '2026-10-17T12:00:00.000Z');
  assert.deepEqual(item, {
    id: 'shop-1', name: 'Καφές', quantity: 2, unit: 'πακέτα', checked: false,
    createdAt: '2026-10-17T12:00:00.000Z'
  });
});

test('toggles one shopping item immutably and leaves other rows unchanged', () => {
  const items = [
    { id: 'a', name: 'Γάλα', checked: false },
    { id: 'b', name: 'Ψωμί', checked: false }
  ];
  const next = toggleShoppingItem(items, 'a');
  assert.deepEqual(next.map((item) => item.checked), [true, false]);
  assert.deepEqual(items.map((item) => item.checked), [false, false]);
});
