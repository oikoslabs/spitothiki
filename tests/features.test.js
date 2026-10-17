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
