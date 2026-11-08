import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPlayApp, showTesterCard, TESTER_GROUP_URL, TESTER_PLAY_URL } from '../src/tester-card.js';
import { dictionaries } from '../src/i18n.js';
const A = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile';
test('v1.9.5 tester card: Android browser only, not Play app, not after dismiss', () => {
  assert.ok(showTesterCard({ userAgent: A }));
  assert.ok(!showTesterCard({ userAgent: 'Mozilla/5.0 (iPhone)' }));
  assert.ok(!showTesterCard({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }));
  assert.ok(!showTesterCard({ userAgent: A, playApp: true }));
  assert.ok(!showTesterCard({ userAgent: A, done: true }));
});
test('v1.9.5 Play app detection', () => {
  assert.ok(isPlayApp({ search: '?src=play' }));
  assert.ok(isPlayApp({ referrer: 'android-app://com.oikoslabs.spitothiki/' }));
  assert.ok(isPlayApp({ session: { getItem: () => '1' } }));
  assert.ok(!isPlayApp({ search: '?src=reddit', referrer: 'https://www.reddit.com/' }));
});
test('v1.9.19 tester card: two steps (Group, then Play opt-in), no email, only × hides it', () => {
  assert.equal(TESTER_GROUP_URL, 'https://groups.google.com/g/spitothiki-testers/about');
  assert.equal(TESTER_PLAY_URL, 'https://play.google.com/apps/testing/com.oikoslabs.spitothiki');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const card = app.slice(app.indexOf('function renderTesterCard'), app.indexOf('function renderStarterCard'));
  assert.doesNotMatch(card, /mailto|testerMailto/);
  assert.ok(card.indexOf('TESTER_GROUP_URL') < card.indexOf('TESTER_PLAY_URL'));
  assert.match(card, /ίδιο λογαριασμό Google/);
  assert.match(card, /δεν μπορεί να δει αν ολοκλήρωσες/);
  assert.equal((card.match(/data-action="tester-done"/g) || []).length, 1); // only the × button
  assert.doesNotMatch(card, /<a [^>]*data-action/);
  const keys = [...card.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]).concat(['1. Ομάδα δοκιμαστών', '2. Δοκιμή στο Google Play']);
  for (const k of keys) assert.ok(dictionaries.en[k], `EN missing: ${k}`);
});
