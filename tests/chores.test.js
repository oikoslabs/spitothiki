import test from 'node:test';
import assert from 'node:assert/strict';
import { choreNotice, choreDates, choreMembers, choreStatus, choresDueToday, choresSummary, createChore, historyCounts, markDone, nextDue, sortChores, undoDone } from '../src/chores.js';

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
  const ds = choreDates([a, b, c], T); assert.equal(ds[0], T); assert.equal(ds[1], '2026-10-24'); assert.equal(ds.length, 91); assert.equal(new Set(ds).size, ds.length);
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

test('v1.6.11: a late, undone chore reminds every day until done, once a day', () => {
  // «Κάλεσε υδραυλικό», due 23/10, still undone on 25/10.
  const plumber = createChore({ name: 'Κάλεσε υδραυλικό', every: 30, start: '2026-10-23' }, '2026-10-23');
  const electrician = createChore({ name: 'Κάλεσε ηλεκτρολόγο', every: 30, start: '2026-10-23' }, '2026-10-23');
  for (const day of ['2026-10-23', '2026-10-24', '2026-10-25']) {
    const dates = choreDates([plumber, electrician], day);
    assert.equal(dates[0], day); assert.ok(dates.includes(addDaysT(day, 1)) && dates.includes(addDaysT(day, 2)), 'tomorrow and after are still booked');
  }
  // Synced on 23/10 and the app never opened again: 24/10 and 25/10 are still on the list.
  const synced = choreDates([plumber, electrician], '2026-10-23');
  assert.ok(synced.includes('2026-10-24') && synced.includes('2026-10-25'));
  // One combined notification a day.
  assert.deepEqual(choreNotice([plumber, electrician], '2026-10-25', '2026-10-24').names, ['Κάλεσε ηλεκτρολόγο', 'Κάλεσε υδραυλικό']);
  assert.equal(choreNotice([plumber, electrician], '2026-10-25', '2026-10-25'), null);
  // Marked done → no more wake-ups until the next due day.
  const done = markDone(plumber, { date: '2026-10-25' });
  assert.equal(choreNotice([done], '2026-10-26', ''), null);
  assert.equal(choreDates([done], '2026-10-26')[0], '2026-11-24');
  assert.deepEqual(choreDates([{ ...plumber, remind: false }], '2026-10-25'), []);
});
const addDaysT = (k, n) => new Date(Date.parse(`${k}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
test('v1.6.11: chores notify on app open too, and the 9:00 push never falls back to a vague text', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(app, /choreNotice\(state\.chores/);
  assert.match(app, /__chores-notified/);
  assert.match(sw, /choresDue\.length && force/);
});
