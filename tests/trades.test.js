import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeJob, createTradeReminder, createTradesperson, dueReminders, nextReminderDue, telHref } from '../src/trades.js';

const now = '2026-11-14T10:00:00.000Z';

test('trades: create person, job, reminder; next due is interval months later', () => {
  assert.throws(() => createTradesperson({ name: '  ' }, now));
  const p = createTradesperson({ name: 'Νίκος', specialty: 'plumber', phone: '2101234567' }, now);
  assert.equal(p.specialty, 'plumber');
  const job = createTradeJob({ tradespersonId: p.id, date: '2026-01-10', description: 'Επισκευή βρύσης', cost: '45,5' }, now);
  assert.equal(job.cost, 45.5);
  const rem = createTradeReminder({ title: 'Σέρβις λέβητα', intervalMonths: 12, lastDone: '2025-11-20', tradespersonId: p.id }, now);
  assert.equal(nextReminderDue(rem), '2026-11-20');
  const due = dueReminders([rem], '2026-11-14', 30);
  assert.equal(due.length, 1);
  assert.equal(due[0].state, 'soon');
});

test('trades: telHref turns a Greek landline or mobile into a tel:+30 link', () => {
  assert.equal(telHref('210 123 4567'), 'tel:+302101234567');
  assert.equal(telHref('6944123456'), 'tel:+306944123456');
  assert.equal(telHref('+30 694 412 3456'), 'tel:+306944123456');
  assert.equal(telHref(''), '');
});
