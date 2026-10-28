import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v1.8.9 Google Play app: assetlinks.json links com.oikoslabs.spitothiki to this site', () => {
  const links = JSON.parse(read('.well-known/assetlinks.json'));
  const entry = links.find((l) => l.target?.package_name === 'com.oikoslabs.spitothiki');
  assert.ok(entry);
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(entry.target.namespace, 'android_app');
  assert.ok(entry.target.sha256_cert_fingerprints.length >= 1);
  for (const fp of entry.target.sha256_cert_fingerprints) assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

test('v1.8.9 hosting: .well-known is published (other dotfiles stay hidden) and served as JSON', () => {
  const fb = JSON.parse(read('firebase.json'));
  assert.ok(!fb.hosting.ignore.includes('**/.*'));
  assert.ok(fb.hosting.ignore.includes('**/.!(well-known)'));
  const h = fb.hosting.headers.find((x) => x.source === '/.well-known/assetlinks.json');
  assert.ok(h.headers.some((x) => x.key === 'Content-Type' && x.value === 'application/json'));
});

test("v1.8.9 source word 'play' (TWA start address /?src=play)", async () => {
  const { parseSource, validEvent } = await import('../src/source.js');
  assert.equal(parseSource('?src=play'), 'play');
  assert.ok(validEvent('visit', 'play') && validEvent('signup', 'play'));
});
