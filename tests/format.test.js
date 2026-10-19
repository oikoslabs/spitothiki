import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, escapeHtml, expiryLabel, formatDate, localDateKey } from '../src/format.js';

const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDateKey(d); };

test('localDateKey pads month/day and uses local time', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5)), '2026-01-05');
});
test('escapeHtml escapes all five characters and empty values', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});
test('daysUntil counts calendar days, null for empty', () => {
  assert.equal(daysUntil(plus(0)), 0);
  assert.equal(daysUntil(plus(3)), 3);
  assert.equal(daysUntil(plus(-2)), -2);
  assert.equal(daysUntil(''), null);
});
test('formatDate: empty/invalid → empty string, valid → non-empty', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate('nope'), '');
  assert.ok(formatDate(plus(1)).length > 2);
});
test('expiryLabel wording (Greek default) is unchanged by the split', () => {
  assert.equal(expiryLabel(plus(0)), 'Λήγει σήμερα');
  assert.equal(expiryLabel(plus(1)), 'Λήγει αύριο');
  assert.equal(expiryLabel(''), '');
  assert.match(expiryLabel(plus(-1)), /^Έληξε /);
});
