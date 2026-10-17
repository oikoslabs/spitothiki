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

test('normalizes Greek search text ignoring accents, case and final sigma', async () => {
  const { normalizeSearch } = await import('../src/domain.js');
  assert.ok(normalizeSearch('Γάλα').includes(normalizeSearch('γαλα')));
  assert.ok(normalizeSearch('Ψωμί').includes(normalizeSearch('ΨΩΜΙ')));
  assert.equal(normalizeSearch('Φακές'), normalizeSearch('ΦΑΚΕΣ'));
});

test('caps quantities and normalizes legacy units', async () => {
  const { MAX_QUANTITY, normalizeUnit } = await import('../src/domain.js');
  assert.throws(() => createPantryItem({ name: 'Γάλα', quantity: MAX_QUANTITY + 1 }), /ποσότητα/i);
  assert.throws(() => createShoppingItem({ name: 'Γάλα', quantity: 1e20 }), /ποσότητα/i);
  assert.throws(() => createShoppingItem({ name: 'Γάλα', quantity: 0 }), /ποσότητα/i);
  assert.equal(createPantryItem({ name: 'Αυγά', quantity: 6, unit: 'τεμάχια' }).unit, 'τεμ.');
  assert.equal(normalizeUnit('γραμμάρια'), 'γραμμάρια');
});

test('warns about implausible expiry dates without blocking', async () => {
  const { expiryWarning } = await import('../src/domain.js');
  assert.match(expiryWarning('2020-01-01', '2026-10-17'), /ένα χρόνο/);
  assert.match(expiryWarning('2040-01-01', '2026-10-17'), /10 χρόνια/);
  assert.equal(expiryWarning('2026-12-01', '2026-10-17'), '');
  assert.equal(expiryWarning('', '2026-10-17'), '');
  assert.equal(createPantryItem({ name: 'Μέλι', quantity: 1, expiry: '2020-01-01' }).expiry, '2020-01-01');
});

test('syncs renamed items to linked shopping rows and legacy rows by old name', async () => {
  const { syncShoppingWithItem } = await import('../src/domain.js');
  const previous = { id: 'i1', name: 'Γάλα', unit: 'λίτρα' };
  const next = { id: 'i1', name: 'Γάλα light', unit: 'πακέτα' };
  const rows = [
    { id: 's1', itemId: 'i1', name: 'Γάλα', unit: 'λίτρα', checked: true },
    { id: 's2', name: 'γάλα', unit: 'λίτρα', checked: false },
    { id: 's3', name: 'Ψωμί', unit: 'τεμ.', checked: false },
    { id: 's4', itemId: 'i2', name: 'Γάλα', unit: 'λίτρα', checked: false }
  ];
  const out = syncShoppingWithItem(rows, previous, next);
  assert.deepEqual(out.map((r) => [r.name, r.unit, r.itemId]), [
    ['Γάλα light', 'πακέτα', 'i1'], ['Γάλα light', 'πακέτα', 'i1'], ['Ψωμί', 'τεμ.', undefined], ['Γάλα', 'λίτρα', 'i2']
  ]);
  assert.equal(createShoppingItem({ name: 'Γάλα', itemId: 'i1' }).itemId, 'i1');
});
