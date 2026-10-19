import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXTRA_CATEGORIES, createExtra, createExtraCategory, deleteExtraCategory, extraCategories, extrasMonth, extrasSummary, lastUnitPrice, quickExtra, setExtraQty, unitPrice, weekStartOf } from '../src/extras.js';

const now = '2026-10-19T10:00:00.000Z';

test('extras: create validates amount, date, category and quantity', () => {
  const e = createExtra({ category: 'coffee', amount: '2,5', date: '2026-10-19', note: '  freddo ' }, now);
  assert.deepEqual([e.amount, e.qty, e.note, e.category], [2.5, 1, 'freddo', 'coffee']);
  assert.equal(createExtra({ category: 'coffee', amount: 5, qty: '2', date: '2026-10-19' }).qty, 2);
  assert.throws(() => createExtra({ category: 'coffee', amount: 0, date: '2026-10-19' }));
  assert.throws(() => createExtra({ category: 'coffee', amount: 1, date: '' }));
  assert.throws(() => createExtra({ amount: 1, date: '2026-10-19' }));
  assert.throws(() => createExtra({ category: 'coffee', amount: 1, qty: 0, date: '2026-10-19' }));
});

test('extras: categories = defaults (rename/hide via stored record) + custom; no duplicate names', () => {
  assert.equal(extraCategories([]).length, DEFAULT_EXTRA_CATEGORIES.length);
  let stored = [createExtraCategory({ id: 'coffee', name: 'Καφεδάκι', emoji: '☕' }, [], now)];
  stored = [...stored, createExtraCategory({ name: 'Λαχεία', emoji: '🎟️ extra' }, stored, now)];
  stored = deleteExtraCategory(stored, 'tobacco', now);
  const list = extraCategories(stored);
  assert.equal(list[0].name, 'Καφεδάκι'); assert.ok(list[0].renamed);
  assert.ok(!list.some((c) => c.id === 'tobacco'));
  assert.equal(list.at(-1).name, 'Λαχεία'); assert.equal(list.at(-1).emoji, '🎟️');
  assert.throws(() => createExtraCategory({ name: 'καφεδακι' }, stored, now));
  assert.throws(() => createExtraCategory({ name: '  ' }, stored, now));
  const customId = list.at(-1).id;
  assert.equal(extraCategories(deleteExtraCategory(stored, customId, now)).some((c) => c.id === customId), false);
});

test('extras: one tap uses the last price per piece; unknown price returns null', () => {
  const entries = [
    createExtra({ id: 'a', category: 'coffee', amount: 2, date: '2026-10-10' }, '2026-10-10T08:00:00Z'),
    createExtra({ id: 'b', category: 'coffee', amount: 5, qty: 2, date: '2026-10-12' }, '2026-10-12T08:00:00Z')
  ];
  assert.equal(lastUnitPrice(entries, 'coffee'), 2.5);
  assert.equal(lastUnitPrice(entries, 'tobacco'), null);
  const q = quickExtra(entries, 'coffee', '2026-10-19', now);
  assert.deepEqual([q.amount, q.qty, q.date], [2.5, 1, '2026-10-19']);
  assert.equal(quickExtra(entries, 'tobacco', '2026-10-19', now), null);
  const two = setExtraQty(q, 3, now);
  assert.deepEqual([two.id, two.qty, two.amount, unitPrice(two)], [q.id, 3, 7.5, 2.5]);
});

test('extras: month totals per category and today/week/month summary', () => {
  const e = (id, category, amount, date, qty = 1) => createExtra({ id, category, amount, date, qty }, now);
  const entries = [e('1', 'coffee', 2.5, '2026-10-19'), e('2', 'coffee', 5, '2026-10-18', 2), e('3', 'tobacco', 4.8, '2026-10-13'), e('4', 'coffee', 3, '2026-10-01'), e('5', 'coffee', 9, '2026-09-30')];
  const m = extrasMonth(entries, '2026-10');
  assert.equal(m.total, 15.3); assert.equal(m.count, 5);
  assert.deepEqual(m.byCategory.map((r) => [r.category, r.total, r.count]), [['coffee', 10.5, 4], ['tobacco', 4.8, 1]]);
  assert.equal(weekStartOf('2026-10-19'), '2026-10-19');
  assert.equal(weekStartOf('2026-10-18'), '2026-10-12');
  const s = extrasSummary(entries, '2026-10-19');
  assert.deepEqual([s.today, s.week, s.month], [2.5, 2.5, 15.3]);
  const s2 = extrasSummary(entries, '2026-10-18');
  assert.deepEqual([s2.today, s2.week], [5, 9.8]);
  // A week crossing months counts both sides.
  assert.equal(extrasSummary(entries, '2026-10-01').week, 12);
});
