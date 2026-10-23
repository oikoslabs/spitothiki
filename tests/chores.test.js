import test from 'node:test';
import assert from 'node:assert/strict';
import { choreDates, choreMembers, choreStatus, choresDueToday, choresSummary, createChore, historyCounts, markDone, nextDue, sortChores, undoDone } from '../src/chores.js';

const T = '2026-10-23';
test('create: validates name and every-N-days, suggestion emoji', () => {
  assert.throws(() => createChore({ name: ' ', every: 3 }, T), /δουλειά/);
  assert.throws(() => createChore({ name: 'Χ', every: 0 }, T), /μέρες/);
  const c = createChore({ name: 'Σκούπισμα', every: '3' }, T);
  assert.equal(c.emoji, '🧹'); assert.equal(c.every, 3); assert.equal(c.remind, true); assert.equal(nextDue(c), T);
});
test('status, next date, sorting and summary', () => {
  let a = markDone(createChore({ name: 'Σκούπισμα', every: 3 }, T), { date: '2026-10-19', by: 'Μαρία' });
  let b = markDone(createChore({ name: 'Σφουγγάρισμα', every: 7 }, T), { date: '2026-10-16' });
  let c = markDone(createChore({ name: 'Ψυγείο', every: 30 }, T), { date: '2026-10-10' });
  assert.equal(nextDue(a), '2026-10-22'); assert.equal(choreStatus(a, T), 'late');
  assert.equal(choreStatus(b, T), 'today'); assert.equal(choreStatus(c, T), 'ok');
  assert.deepEqual(sortChores([c, b, a], T).map((x) => x.name), ['Σκούπισμα', 'Σφουγγάρισμα', 'Ψυγείο']);
  assert.deepEqual(choresSummary([a, b, c], T), { late: 1, today: 1, ok: 1 });
  assert.deepEqual(choresDueToday([a, b, { ...c }], T).map((x) => x.name), ['Σκούπισμα', 'Σφουγγάρισμα']);
  assert.deepEqual(choreDates([a, b, c], T), [T, '2026-11-09']);
  assert.deepEqual(choreDates([{ ...a, remind: false }], T), []);
});
test('undo removes the last tapped ✓; history counts per member; members list', () => {
  let a = createChore({ name: 'Σκούπισμα', every: 3, assignee: 'Γιάννης' }, T);
  a = markDone(a, { date: '2026-10-20', by: 'Μαρία' }, '1'); a = markDone(a, { date: '2026-10-22', by: 'Γιάννης' }, '2'); a = markDone(a, { date: '2026-10-23', by: 'Μαρία' }, '3');
  assert.deepEqual(historyCounts(a, T).by, [{ name: 'Μαρία', count: 2 }, { name: 'Γιάννης', count: 1 }]);
  const u = undoDone(a, '4'); assert.equal(u.history.length, 2); assert.equal(nextDue(u), '2026-10-25');
  assert.deepEqual(choreMembers([a], ['Γιάννης']).sort(), ['Γιάννης', 'Μαρία']);
});
test('chores are part of backups and household sync', async () => {
  const { parseBackup, DATA_KINDS } = await import('../src/storage.js');
  assert.ok(DATA_KINDS.includes('chores'));
  const chores = [createChore({ name: 'Σκούπισμα', every: 3 }, T)];
  assert.deepEqual(parseBackup(JSON.stringify({ items: [], shopping: [], chores })).chores, chores);
});
