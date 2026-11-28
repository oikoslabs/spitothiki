import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAndroid, isPlayApp, showTesterCard, TESTER_GROUP_URL, TESTER_INVITE_UNTIL_LAUNCH, TESTER_KEY, TESTER_PLAY_URL } from '../src/tester-card.js';
import { dictionaries } from '../src/i18n.js';
const A = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130';

test('tester invite is Android-only, hidden in the Play app, and stays gone after dismiss', () => {
  assert.equal(TESTER_INVITE_UNTIL_LAUNCH, true);
  assert.equal(TESTER_KEY, 'spitothiki:tester-card-done');
  assert.ok(isAndroid(A));
  assert.ok(!isAndroid(IPHONE));
  assert.ok(!isAndroid(DESKTOP));
  assert.ok(showTesterCard({ android: true }));
  assert.ok(!showTesterCard());
  assert.ok(!showTesterCard({ android: false }));
  assert.ok(!showTesterCard({ userAgent: IPHONE, android: isAndroid(IPHONE) }));
  assert.ok(!showTesterCard({ userAgent: DESKTOP, android: isAndroid(DESKTOP), done: false }));
  assert.ok(!showTesterCard({ android: true, done: true }));
  assert.ok(!showTesterCard({ android: true, playApp: true }));
  assert.ok(!showTesterCard({ android: true, untilLaunch: false }));
  assert.ok(!showTesterCard({ untilLaunch: false, android: true, done: false }));
});

test('v1.9.5 Play app detection', () => {
  assert.ok(isPlayApp({ search: '?src=play' }));
  assert.ok(isPlayApp({ referrer: 'android-app://com.oikoslabs.spitothiki/' }));
  assert.ok(isPlayApp({ session: { getItem: () => '1' } }));
  assert.ok(!isPlayApp({ search: '?src=reddit', referrer: 'https://www.reddit.com/' }));
});

test('v1.9.51 tester card: short invite, two steps (Group, then Play opt-in); × dismisses', () => {
  assert.equal(TESTER_GROUP_URL, 'https://groups.google.com/g/spitothiki-testers/about');
  assert.equal(TESTER_PLAY_URL, 'https://play.google.com/apps/testing/com.oikoslabs.spitothiki');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const card = app.slice(app.indexOf('function renderTesterCard'), app.indexOf('function renderStarterCard'));
  assert.doesNotMatch(card, /mailto|testerMailto/);
  assert.ok(card.indexOf('TESTER_GROUP_URL') < card.indexOf('TESTER_PLAY_URL'));
  assert.match(card, /ίδιο λογαριασμό Google/);
  assert.match(card, /περίπου 1 λεπτό/);
  assert.match(card, /δωρεάν/);
  assert.match(card, /τίποτα δεν αλλάζει στα δεδομένα σου/);
  assert.match(card, /δεν μπορεί να δει αν ολοκλήρωσες/);
  assert.match(card, /TESTER_KEY/);
  assert.match(card, /isAndroid\(navigator\.userAgent\)/);
  assert.equal((card.match(/data-action="tester-done"/g) || []).length, 1);
  assert.doesNotMatch(card, /tester-collapse|tester-expand|TESTER_COLLAPSE_KEY|tester-banner/);
  assert.doesNotMatch(card, /<a [^>]*data-action/);
  assert.match(app, /action === 'tester-done'/);
  assert.match(app, /writeKey\(TESTER_KEY, '1'\)/);
  assert.doesNotMatch(app, /tester-collapse|tester-expand|TESTER_COLLAPSE_KEY/);
  const keys = [...card.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]).concat(['1. Ομάδα δοκιμαστών', '2. Δοκιμή στο Google Play', 'Μην το εμφανίσεις ξανά']);
  for (const k of keys) assert.ok(dictionaries.en[k], `EN missing: ${k}`);
});
