import test from 'node:test';
import assert from 'node:assert/strict';
import { pushDates } from '../src/push.js';
import { cleanDates, validEndpoint, athensToday } from '../push/worker.js';

test('push dates: bills day-before/on due, skips paid & direct debit; expiries N days before', () => {
  const bills = [
    { due: '2026-10-25', remind: 1 }, { due: '2026-10-30', remind: 3, paid: true }, { due: '2026-11-02', remind: 1, autoPay: true }, { due: '2026-10-01', remind: 1 }
  ];
  const items = [{ expiry: '2026-10-28' }, { expiry: '2026-10-22' }, { expiry: '' }];
  assert.deepEqual(pushDates({ bills, items }, { days: 2, today: '2026-10-21' }), ['2026-10-21', '2026-10-24', '2026-10-25', '2026-10-26']);
  assert.deepEqual(pushDates({}, { today: '2026-10-21' }), []);
});

test('push worker: endpoint allowlist, date cleanup, Athens day', () => {
  assert.ok(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(!validEndpoint('https://evil.example.com/x'));
  assert.ok(!validEndpoint('http://fcm.googleapis.com/x'));
  assert.deepEqual(cleanDates(['2026-10-20', '2026-10-22', 'x', '2026-10-22', 5], '2026-10-21'), ['2026-10-22']);
  assert.equal(athensToday(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
});
