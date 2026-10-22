import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authKnown, isProtected, showProtectCard, showProtectSheet, snoozeUntilFrom, storageMode } from '../src/protect.js';

test('protected when signed in or Drive connected', () => {
  assert.equal(isProtected({}), false);
  assert.equal(isProtected({ signedIn: true }), true);
  assert.equal(isProtected({ driveOn: true }), true);
  assert.equal(storageMode({ signedIn: true, driveOn: true }), 'synced');
  assert.equal(storageMode({}), 'local');
});
test('auth known only after Firebase answers', () => {
  assert.equal(authKnown({ state: 'loading' }), false);
  assert.equal(authKnown({ state: 'connecting' }), false);
  assert.equal(authKnown({ state: 'connecting', user: {} }), true);
  assert.equal(authKnown({ state: 'signed-out' }), true);
  assert.equal(authKnown({ state: 'disabled' }), true);
});
test('merged card: hidden when signed in, Drive on, unknown or snoozed', () => {
  const now = 1_000_000_000_000;
  assert.equal(showProtectCard({ now }), true);
  assert.equal(showProtectCard({ signedIn: true, now }), false);
  assert.equal(showProtectCard({ driveOn: true, now }), false);
  assert.equal(showProtectCard({ known: false, now }), false);
  assert.equal(showProtectCard({ snoozeUntil: snoozeUntilFrom(now), now: now + 13 * 86_400_000 }), false);
  assert.equal(showProtectCard({ snoozeUntil: snoozeUntilFrom(now), now: now + 15 * 86_400_000 }), true);
});
test('one-time sheet: only once, never for protected users or during onboarding', () => {
  assert.equal(showProtectSheet({}), true);
  assert.equal(showProtectSheet({ seen: true }), false);
  assert.equal(showProtectSheet({ signedIn: true }), false);
  assert.equal(showProtectSheet({ driveOn: true }), false);
  assert.equal(showProtectSheet({ onboarding: true }), false);
  assert.equal(showProtectSheet({ known: false }), false);
});
test('home shows a single protect card (old sign-in/backup cards merged)', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('renderProtectCard()'));
  assert.ok(!app.includes('renderBackupReminder() || renderSigninCard()'));
  const screens = readFileSync(new URL('../screens.html', import.meta.url), 'utf8');
  assert.match(screens, /Συνδέσου ή σύνδεσε Google Drive για να μη χαθούν/);
});
test('service worker cache bumped to v57 and caches protect.js', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /CACHE_VERSION = 'v57'/);
  assert.ok(sw.includes("'./src/protect.js'"));
});
