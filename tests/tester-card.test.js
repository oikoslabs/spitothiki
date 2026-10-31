import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlayApp, showTesterCard, testerMailto } from '../src/tester-card.js';
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
test('v1.9.5 mailto prefilled', () => {
  const m = testerMailto('Δοκιμαστής Σπιτοθήκης', 'x y');
  assert.ok(m.startsWith('mailto:oikoslabs.apps@gmail.com?subject='));
  assert.ok(m.includes(encodeURIComponent('Δοκιμαστής Σπιτοθήκης')) && m.endsWith('body=x%20y'));
});
