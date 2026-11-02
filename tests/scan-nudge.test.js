// v1.9.11: opt-in scan reminder: dates only, at most one a week, off by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastScanDate, scanNudgeDates } from '../src/push.js';

test('v1.9.11 scan nudge dates', () => {
  assert.deepEqual(scanNudgeDates('2026-11-01', '2026-11-02'), ['2026-11-08', '2026-11-15']);
  assert.deepEqual(scanNudgeDates('2026-10-01', '2026-11-02'), ['2026-11-09', '2026-11-16']);
  assert.deepEqual(scanNudgeDates('', '2026-11-02'), ['2026-11-09', '2026-11-16']);
  assert.equal(lastScanDate([{ importedAt: '2026-10-30T10:00:00Z' }, { importedAt: '2026-11-01T08:00:00Z' }, {}]), '2026-11-01');
});

test('v1.9.11 off by default, toggle only in the notifications card, SW checks 7 days', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /scanNudge: Boolean\(saved\.scanNudge\)/);
  assert.match(app, /notifySettings\(\)\.scanNudge \? scanNudgeDates/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /snap\?\.scanNudge && \(!snap\.lastScan \|\| addDaysKey\(snap\.lastScan, 7\) <= todayKey\(\)\)/);
});
