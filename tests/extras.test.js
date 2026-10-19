import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtra, createExtraCategory, deleteExtraCategory, extraCategories, findExtraCategory, suggestEmoji, extrasMonth, extrasSummary, lastUnitPrice, quickExtra, setExtraQty, unitPrice, weekStartOf } from '../src/extras.js';

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

test('extras: no fixed buttons; typed items become buttons; emoji guessed from the name; no duplicate names', () => {
  assert.deepEqual(extraCategories([], []), []);
  let stored = [createExtraCategory({ name: 'Φρέντο' }, [], now)];
  assert.equal(stored[0].emoji, '☕');
  stored = [...stored, createExtraCategory({ name: 'Λαχεία', emoji: '🎟️ extra' }, stored, now)];
  assert.equal(stored[1].emoji, '🎟️');
  assert.equal(createExtraCategory({ name: 'Κάτι άλλο' }, stored, now).emoji, '');
  assert.throws(() => createExtraCategory({ name: 'φρεντο' }, stored, now));
  assert.throws(() => createExtraCategory({ name: '  ' }, stored, now));
  assert.equal(findExtraCategory(extraCategories(stored), ' ΦΡΈΝΤΟ ').id, stored[0].id);
  assert.deepEqual([suggestEmoji('Τυρόπιτα'), suggestEmoji('Εφημερίδα'), suggestEmoji('Red Bull'), suggestEmoji('xyz')], ['🥪', '📰', '🥤', '']);
  const id = stored[1].id;
  assert.equal(extraCategories(deleteExtraCategory(stored, id, now)).some((c) => c.id === id), false);
});

test('extras: migration keeps old default categories only if they have entries; delete hides them for good', () => {
  const entries = [createExtra({ id: 'e1', category: 'coffee', amount: 2, date: '2026-10-10' }, now), createExtra({ id: 'e2', category: 'filters', amount: 1, date: '2026-10-11' }, now)];
  const list = extraCategories([], entries);
  assert.deepEqual(list.map((c) => c.id).sort(), ['coffee', 'filters']);
  assert.ok(list.every((c) => c.legacy));
  // Renamed in v1 (stored record) → stays, with the new name, even without entries.
  const renamed = extraCategories([{ id: 'tobacco', name: 'Στριφτό', emoji: '🚬', createdAt: now }], entries);
  assert.ok(renamed.some((c) => c.id === 'tobacco' && c.name === 'Στριφτό' && !c.legacy));
  // v1 hidden marker / deleted now → not shown even though it has entries.
  const hidden = deleteExtraCategory([], 'coffee', now);
  assert.equal(hidden[0].hidden, true);
  assert.deepEqual(extraCategories(hidden, entries).map((c) => c.id), ['filters']);
  // A suggestion chip used later replaces the marker.
  const back = [createExtraCategory({ id: 'coffee', name: 'Καφές' }, [], now)];
  assert.ok(extraCategories(back, entries).some((c) => c.id === 'coffee'));
});

test('extras: buttons sorted by how often they are used, then most recent', () => {
  const stored = ['A', 'B', 'C', 'D'].map((name, i) => ({ id: name, name, emoji: '', createdAt: `2026-10-0${i + 1}T00:00:00Z` }));
  const e = (id, category, date) => createExtra({ id, category, amount: 1, date }, `${date}T08:00:00Z`);
  const entries = [e('1', 'B', '2026-10-10'), e('2', 'B', '2026-10-11'), e('3', 'C', '2026-10-12'), e('4', 'A', '2026-10-09'), e('5', 'C', '2026-10-01'), e('6', 'B', '2026-10-02')];
  assert.deepEqual(extraCategories(stored, entries).map((c) => c.id), ['B', 'C', 'A', 'D']);
  assert.equal(extraCategories(stored, entries)[0].uses, 3);
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
