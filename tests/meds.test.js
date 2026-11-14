import test from 'node:test';
import assert from 'node:assert/strict';
import { allDueDoses, createMed, isLowStock, markTaken, undoTaken } from '../src/meds.js';

const now = '2026-11-14T10:00:00.000Z';

test('meds: create validates name and times; records a dose and reduces pills', () => {
  assert.throws(() => createMed({ name: '', times: ['08:00'] }, now));
  assert.throws(() => createMed({ name: 'Depon', times: [] }, now));
  const med = createMed({ name: 'Depon', person: 'Μαρία', times: '08:00, 20:00, 08:00', quantity: 10, doseQty: 1, alertBelow: 3 }, now);
  assert.deepEqual(med.times, ['08:00', '20:00']);
  assert.equal(isLowStock(med), false);
  const due = allDueDoses([med], '2026-11-14', '09:00');
  assert.equal(due.length, 1);
  assert.equal(due[0].time, '08:00');
  const taken = markTaken(med, { date: '2026-11-14', time: '08:00', now });
  assert.equal(taken.quantity, 9);
  assert.deepEqual(taken.taken['2026-11-14'], ['08:00']);
  assert.equal(allDueDoses([taken], '2026-11-14', '09:00').length, 0);
  const undone = undoTaken(taken, { date: '2026-11-14', time: '08:00', now });
  assert.equal(undone.quantity, 10);
  const low = markTaken({ ...med, quantity: 3 }, { date: '2026-11-14', time: '08:00', now });
  assert.equal(isLowStock(low), true);
});
