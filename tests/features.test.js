import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, applyRecurring, createRecurring, dueFromSnapshot, parseVoiceItems } from '../src/features.js';

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
});

test('recurring item is added when due, once, and moves forward', () => {
  const rule = createRecurring({ name: 'Γάλα', quantity: 2, unit: 'λίτρα', everyDays: 7, nextDue: '2026-10-01' }, '2026-10-18');
  const first = applyRecurring([rule], [], '2026-10-18');
  assert.equal(first.added.length, 1);
  assert.equal(first.shopping[0].name, 'Γάλα');
  assert.equal(first.shopping[0].id, `rec-${rule.id}-2026-10-01`);
  assert.equal(first.recurring[0].nextDue, '2026-10-22');
  const again = applyRecurring(first.recurring, first.shopping, '2026-10-18');
  assert.equal(again.changed, false);
  assert.equal(again.shopping.length, 1);
  // Still pending at the next due date: not added a second time.
  const later = applyRecurring(first.recurring, first.shopping, '2026-10-22');
  assert.equal(later.added.length, 0);
  assert.equal(later.recurring[0].nextDue, '2026-10-29');
});

test('recurring validation', () => {
  assert.throws(() => createRecurring({ name: '', everyDays: 7 }, '2026-10-18'));
  assert.throws(() => createRecurring({ name: 'x', everyDays: 0 }, '2026-10-18'));
});

test('voice parsing in Greek and English', () => {
  assert.deepEqual(parseVoiceItems('ψωμί και αυγά'), [{ name: 'Ψωμί', quantity: 1 }, { name: 'Αυγά', quantity: 1 }]);
  assert.deepEqual(parseVoiceItems('2 γάλατα, δύο ντομάτες και φέτα'), [{ name: 'Γάλατα', quantity: 2 }, { name: 'Ντομάτες', quantity: 2 }, { name: 'Φέτα', quantity: 1 }]);
  assert.deepEqual(parseVoiceItems('bread and eggs'), [{ name: 'Bread', quantity: 1 }, { name: 'Eggs', quantity: 1 }]);
  assert.deepEqual(parseVoiceItems('three apples, milk and 1.5 cheese'), [{ name: 'Apples', quantity: 3 }, { name: 'Milk', quantity: 1 }, { name: 'Cheese', quantity: 1.5 }]);
  assert.deepEqual(parseVoiceItems(''), []);
});

test('service worker expiry snapshot selects items due within the window', () => {
  const snap = { days: 3, items: [{ name: 'a', expiry: '2026-10-17' }, { name: 'b', expiry: '2026-10-20' }, { name: 'c', expiry: '2026-10-18' }, { name: 'd', expiry: '2026-10-25' }] };
  assert.deepEqual(dueFromSnapshot(snap, '2026-10-18').map((i) => i.name), ['c', 'b']);
});

import { applyWaste, createStore, createWaste, groupByStore, monthlySpending, moveCategory, purchaseFor, rowCategory, shiftMonth, storeOrder, wasteStats } from '../src/features.js';

test('store walking order and grouping', () => {
  let store = createStore({ name: 'Lidl', order: ['Γαλακτοκομικά', 'bogus'] });
  assert.equal(store.order[0], 'Γαλακτοκομικά');
  assert.equal(store.order.length, 8);
  store = moveCategory(store, 'Ροφήματα', -1);
  assert.ok(store.order.indexOf('Ροφήματα') < store.order.indexOf('Κατεψυγμένα'));
  assert.equal(moveCategory(store, 'Γαλακτοκομικά', -1), store);
  const items = [{ id: 'i1', name: 'Γάλα', category: 'Γαλακτοκομικά' }];
  const rows = [{ id: 'a', name: 'Χαρτί' }, { id: 'b', name: 'γαλα' }, { id: 'c', name: 'Μήλα', category: 'Φρούτα & λαχανικά' }];
  assert.equal(rowCategory(rows[1], items), 'Γαλακτοκομικά');
  const groups = groupByStore(rows, store, items);
  assert.deepEqual(groups.map((g) => g.category), ['Γαλακτοκομικά', 'Φρούτα & λαχανικά', 'Άλλο']);
  assert.deepEqual(storeOrder(undefined).length, 8);
  assert.throws(() => createStore({ name: ' ' }));
});

test('prices and monthly spending', () => {
  const p1 = purchaseFor({ id: 'r1', name: 'Γάλα', category: 'Γαλακτοκομικά' }, '1,35', { date: '2026-10-03' });
  const p2 = purchaseFor({ id: 'r2', name: 'Μήλα', category: 'Φρούτα & λαχανικά' }, 2.4, { date: '2026-10-10' });
  const p3 = purchaseFor({ id: 'r3', name: 'Τυρί', category: 'Γαλακτοκομικά' }, 4, { date: '2026-10-11' });
  const old = purchaseFor({ id: 'r4', name: 'x' }, 9, { date: '2026-09-30' });
  assert.equal(p1.id, 'pur-r1');
  assert.equal(p1.price, 1.35);
  const m = monthlySpending([p1, p2, p3, old], '2026-10');
  assert.equal(m.total, 7.75);
  assert.deepEqual(m.byCategory, [{ category: 'Γαλακτοκομικά', total: 5.35 }, { category: 'Φρούτα & λαχανικά', total: 2.4 }]);
  assert.throws(() => purchaseFor({ id: 'x', name: 'x' }, 'abc', { date: '2026-10-01' }));
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

test('waste records lower stock and feed monthly stats', () => {
  const item = { id: 'i1', name: 'Γιαούρτι', quantity: 3, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά' };
  const w1 = createWaste(item, { quantity: 1, reason: 'expired' }, '2026-10-05');
  assert.equal(applyWaste([item], w1)[0].quantity, 2);
  const w2 = createWaste(item, { reason: 'nonsense' }, '2026-10-06');
  assert.equal(w2.reason, 'other');
  assert.deepEqual(applyWaste([item], w2), []);
  assert.equal(applyWaste([{ ...item, minimum: 1 }], w2)[0].quantity, 0);
  const stats = wasteStats([w1, w2, createWaste({ ...item, name: 'Ψωμί' }, { quantity: 1, reason: 'spoiled' }, '2026-09-01')], '2026-10');
  assert.equal(stats.count, 2);
  assert.equal(stats.byReason.expired, 1);
  assert.deepEqual(stats.top, [{ name: 'Γιαούρτι', count: 2 }]);
});
