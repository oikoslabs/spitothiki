// v1.9.3 security audit guards (static checks; the real rules tests run in the emulator: tests/rules/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v1.9.3 hosting sends anti-framing and object/base CSP headers', () => {
  const all = JSON.parse(read('firebase.json')).hosting.headers.find((h) => h.source === '**').headers;
  const get = (k) => all.find((h) => h.key === k)?.value || '';
  assert.equal(get('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(get('Content-Security-Policy'), /frame-ancestors 'self'/);
  assert.match(get('Content-Security-Policy'), /object-src 'none'/);
  assert.equal(get('X-Content-Type-Options'), 'nosniff');
});
test('v1.9.3 receipt link is rendered only for https URLs (no javascript: links from synced data)', () => {
  assert.match(read('src/app.js'), /\/\^https:\\\/\\\/\/i\.test\(String\(r\.url \|\| ''\)\) \? `<p><a class="panel-link" href=/);
});
test('v1.9.3 Firestore rules validate record field types and household keys', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /request\.resource\.data\.kind is string && request\.resource\.data\.kind\.size\(\) <= 40/);
  assert.match(rules, /request\.resource\.data\.deleted is bool && request\.resource\.data\.ts is number/);
  assert.match(rules, /hasOnly\(\['ownerUid', 'members', 'createdAt', 'lastJoinCode'\]\)/);
});
test('v1.9.3 receipt proxy follows redirects by hand and the push worker keeps no request logs', () => {
  assert.match(read('proxy/worker.js'), /redirect: 'manual'/);
  assert.doesNotMatch(read('proxy/worker.js'), /redirect: 'follow'/);
  assert.match(read('push/wrangler.toml'), /\[observability\]\nenabled = false/);
});
